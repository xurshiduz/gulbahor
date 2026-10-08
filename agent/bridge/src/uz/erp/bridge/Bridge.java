package uz.erp.bridge;

import com.rscja.deviceapi.ConnectionState;
import com.rscja.deviceapi.RFIDWithUHFNetworkUR4;
import com.rscja.deviceapi.RFIDWithUHFUsb;
import com.rscja.deviceapi.entity.AntennaNameEnum;
import com.rscja.deviceapi.entity.AntennaState;
import com.rscja.deviceapi.entity.UHFTAGInfo;
import com.rscja.deviceapi.interfaces.ConnectionStateCallback;
import com.rscja.deviceapi.interfaces.IUHFInventoryCallback;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Between a Chainway reader and the shop agent.
 *
 * The readers speak only through their maker's library. The agent hears a
 * reader as lines of text on a TCP port: every line is the code of a tag
 * just read, and writing ALARM to the same connection sounds the gate
 * (agent/src/readers.ts). This program is the few lines in between: it
 * reads with the library and says what it read the way the agent listens.
 *
 *   r3   the desk reader on a till, on this computer's USB
 *   ur4  the fixed reader of a gate, on the shop's network
 *
 * It listens on this computer only: nothing outside it can connect.
 *
 * NOT YET RUN AGAINST A DEVICE. The calls are the ones the maker's own demo
 * makes (ReaderAPI20250926.jar); what a real reader does with them is to be
 * seen when one is on the table. See README.md beside this folder.
 */
public final class Bridge {
    /** How often a reader that is not there is tried again, and how often the line to it is looked at. */
    private static final long RETRY_MS = 3000;

    private interface Reader {
        /** Connects and starts reading. False when the reader is not there. */
        boolean open(IUHFInventoryCallback onTag, Runnable onLost);

        void close();

        /** Sounds the gate, or stops it. A reader with nothing to sound ignores it. */
        void alarm(boolean on);
    }

    /** Chainway R3: a pad on the counter, one antenna, on USB. */
    private static final class DeskReader implements Reader {
        private final int power;
        private final RFIDWithUHFUsb uhf = RFIDWithUHFUsb.getInstance();

        DeskReader(int power) {
            this.power = power;
        }

        @Override
        public boolean open(IUHFInventoryCallback onTag, final Runnable onLost) {
            if (!uhf.init("")) {
                return false;
            }
            uhf.setConnectionStateCallback(new ConnectionStateCallback() {
                @Override
                public void getState(ConnectionState state, Object device) {
                    if (state == ConnectionState.DISCONNECTED) {
                        onLost.run();
                    }
                }
            });
            // Low on purpose: the goods lying beside the pad must not be read with the ones on it.
            if (!uhf.setPower(AntennaNameEnum.ANT1, power)) {
                log("Quvvatni o'rnatib bo'lmadi (" + power + " dBm): o'quvchining o'z sozlamasi qoladi");
            }
            uhf.setInventoryCallback(onTag);
            if (!uhf.startInventoryTag()) {
                close();
                return false;
            }
            return true;
        }

        @Override
        public void close() {
            uhf.setConnectionStateCallback(null);
            try {
                uhf.stopInventory();
            } catch (RuntimeException ignored) {
                // Already gone.
            }
            uhf.free();
        }

        @Override
        public void alarm(boolean on) {
            // Nothing to sound at a till.
        }
    }

    /** Chainway UR4: up to four antennas at the door, reached over the network, with a relay for the light and siren. */
    private static final class GateReader implements Reader {
        private final String host;
        private final int port;
        private final int power;
        private final List<Integer> antennas;
        private final RFIDWithUHFNetworkUR4 ur4 = new RFIDWithUHFNetworkUR4();

        GateReader(String host, int port, int power, List<Integer> antennas) {
            this.host = host;
            this.port = port;
            this.power = power;
            this.antennas = antennas;
        }

        @Override
        public boolean open(IUHFInventoryCallback onTag, final Runnable onLost) {
            if (!ur4.init(host, port)) {
                return false;
            }
            ur4.setConnectionStateCallback(new ConnectionStateCallback() {
                @Override
                public void getState(ConnectionState state, Object device) {
                    if (state == ConnectionState.DISCONNECTED) {
                        onLost.run();
                    }
                }
            });
            AntennaNameEnum[] ports = {AntennaNameEnum.ANT1, AntennaNameEnum.ANT2, AntennaNameEnum.ANT3, AntennaNameEnum.ANT4};
            List<AntennaState> states = new ArrayList<AntennaState>();
            for (int index = 0; index < ports.length; index++) {
                states.add(new AntennaState(ports[index], antennas.contains(index + 1)));
            }
            if (!ur4.setAntenna(states)) {
                log("Antennalarni tanlab bo'lmadi: o'quvchining o'z sozlamasi qoladi");
            }
            for (int index = 0; index < ports.length; index++) {
                if (antennas.contains(index + 1) && !ur4.setPower(ports[index], power)) {
                    log("ANT" + (index + 1) + " quvvatini o'rnatib bo'lmadi (" + power + " dBm)");
                }
            }
            // A siren left on by a program that died must not greet the shop in the morning.
            ur4.setGPO((byte) 0, (byte) 0, (byte) 0);
            ur4.setInventoryCallback(onTag);
            if (!ur4.startInventoryTag()) {
                close();
                return false;
            }
            return true;
        }

        @Override
        public void close() {
            ur4.setConnectionStateCallback(null);
            try {
                ur4.stopInventory();
                ur4.setGPO((byte) 0, (byte) 0, (byte) 0);
            } catch (RuntimeException ignored) {
                // Already gone.
            }
            ur4.free();
        }

        @Override
        public void alarm(boolean on) {
            // Whether the reader takes this while it is reading has to be seen on the device; if it does not,
            // reading is stopped for the command and started again.
            if (!ur4.setGPO((byte) 0, (byte) 0, (byte) (on ? 1 : 0))) {
                log("Releni " + (on ? "yoqib" : "o'chirib") + " bo'lmadi");
            }
        }
    }

    /** Whoever is listening: the agent, and whoever else on this computer cares to watch. */
    private static final class Listeners {
        private final List<Socket> sockets = new CopyOnWriteArrayList<Socket>();
        private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
        private final Reader reader;
        private final long alarmMs;
        private ScheduledFuture<?> silence;

        Listeners(Reader reader, long alarmMs) {
            this.reader = reader;
            this.alarmMs = alarmMs;
        }

        void listen(int port) throws IOException {
            final ServerSocket server = new ServerSocket(port, 20, InetAddress.getByName("127.0.0.1"));
            Thread accepting = new Thread(new Runnable() {
                @Override
                public void run() {
                    for (;;) {
                        try {
                            final Socket socket = server.accept();
                            socket.setTcpNoDelay(true);
                            sockets.add(socket);
                            log("Agent ulandi");
                            Thread hearing = new Thread(new Runnable() {
                                @Override
                                public void run() {
                                    hear(socket);
                                }
                            }, "listener");
                            hearing.setDaemon(true);
                            hearing.start();
                        } catch (IOException error) {
                            log("Ulanishni qabul qilib bo'lmadi: " + error.getMessage());
                        }
                    }
                }
            }, "accept");
            accepting.setDaemon(true);
            accepting.start();
        }

        /** One line to everyone listening; a listener that has gone is dropped. */
        void say(String line) {
            byte[] bytes = (line + "\n").getBytes(StandardCharsets.US_ASCII);
            for (Socket socket : sockets) {
                try {
                    OutputStream out = socket.getOutputStream();
                    synchronized (socket) {
                        out.write(bytes);
                        out.flush();
                    }
                } catch (IOException gone) {
                    drop(socket);
                }
            }
        }

        private void hear(Socket socket) {
            try {
                BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
                String line;
                while ((line = in.readLine()) != null) {
                    if ("ALARM".equals(line.trim())) {
                        ring();
                    }
                }
            } catch (IOException gone) {
                // The same as a closed line.
            }
            drop(socket);
        }

        private void drop(Socket socket) {
            if (sockets.remove(socket)) {
                log("Agent uzildi");
            }
            try {
                socket.close();
            } catch (IOException ignored) {
                // Closed already.
            }
        }

        /** Sounds the gate for a while. Asked again while it sounds, it goes on that much longer. */
        private synchronized void ring() {
            log("DARVOZA: signal");
            reader.alarm(true);
            if (silence != null) {
                silence.cancel(false);
            }
            silence = timer.schedule(new Runnable() {
                @Override
                public void run() {
                    reader.alarm(false);
                }
            }, alarmMs, TimeUnit.MILLISECONDS);
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 0 || !(args[0].equals("r3") || args[0].equals("ur4"))) {
            usage();
            return;
        }
        final boolean gate = args[0].equals("ur4");
        int listen = gate ? 8892 : 8891;
        String readerAt = "192.168.99.202:8888";
        int power = gate ? 30 : 10;
        long alarmMs = 3000;
        List<Integer> antennas = new ArrayList<Integer>(Arrays.asList(1, 2));
        try {
            for (int index = 1; index < args.length; index += 2) {
                String value = index + 1 < args.length ? args[index + 1] : "";
                if (args[index].equals("--listen")) {
                    listen = Integer.parseInt(value);
                } else if (args[index].equals("--reader")) {
                    readerAt = value;
                } else if (args[index].equals("--power")) {
                    power = Integer.parseInt(value);
                } else if (args[index].equals("--alarm-ms")) {
                    alarmMs = Long.parseLong(value);
                } else if (args[index].equals("--antennas")) {
                    antennas.clear();
                    for (String part : value.split(",")) {
                        antennas.add(Integer.parseInt(part.trim()));
                    }
                } else {
                    usage();
                    return;
                }
            }
        } catch (NumberFormatException wrong) {
            usage();
            return;
        }
        if (power < 1 || power > 33 || listen < 1 || listen > 65535) {
            usage();
            return;
        }

        final Reader reader;
        if (gate) {
            int colon = readerAt.lastIndexOf(':');
            String host = colon < 0 ? readerAt : readerAt.substring(0, colon);
            int port = colon < 0 ? 8888 : Integer.parseInt(readerAt.substring(colon + 1));
            reader = new GateReader(host, port, power, antennas);
            log("Darvoza o'quvchisi (UR4): " + host + ":" + port + ", antennalar " + antennas + ", " + power + " dBm");
        } else {
            reader = new DeskReader(power);
            log("Kassa o'quvchisi (R3): USB, " + power + " dBm");
        }

        final Listeners listeners = new Listeners(reader, alarmMs);
        listeners.listen(listen);
        log("Agent uchun port: 127.0.0.1:" + listen);

        final IUHFInventoryCallback onTag = new IUHFInventoryCallback() {
            @Override
            public void callback(UHFTAGInfo tag) {
                String epc = tag == null ? null : tag.getEPC();
                if (epc != null && !epc.isEmpty()) {
                    // Code, antenna, signal: the agent reads the code and passes over the rest.
                    listeners.say(epc.replaceAll("\\s", "").toUpperCase() + "," + tag.getAnt() + "," + tag.getRssi());
                }
            }
        };
        // 0: not connected. 1: reading. 2: the line dropped and has to be tidied up before it is dialled again.
        final int[] state = {0};
        final Runnable onLost = new Runnable() {
            @Override
            public void run() {
                synchronized (state) {
                    if (state[0] == 1) {
                        state[0] = 2;
                        log("O'quvchi uzildi");
                    }
                }
            }
        };
        Runtime.getRuntime().addShutdownHook(new Thread(new Runnable() {
            @Override
            public void run() {
                reader.close();
            }
        }));

        boolean waiting = false;
        for (;;) {
            int now;
            synchronized (state) {
                now = state[0];
            }
            if (now == 2) {
                reader.close();
                synchronized (state) {
                    state[0] = 0;
                }
            } else if (now == 0) {
                boolean opened;
                try {
                    opened = reader.open(onTag, onLost);
                } catch (RuntimeException | LinkageError failed) {
                    // The maker's native library is missing or will not load: nothing will change by itself.
                    log("O'quvchi kutubxonasi ishlamadi: " + failed);
                    opened = false;
                }
                if (opened) {
                    synchronized (state) {
                        state[0] = 1;
                    }
                    waiting = false;
                    log("O'quvchi ulandi, o'qiyapti");
                } else if (!waiting) {
                    // Said once, not every three seconds for as long as the reader is switched off.
                    waiting = true;
                    log("O'quvchi topilmadi; ulanguncha qayta urinib turiladi");
                }
            }
            Thread.sleep(RETRY_MS);
        }
    }

    private static void usage() {
        System.err.println("ERP: Chainway o'quvchisi bilan do'kon agenti orasidagi ko'prik");
        System.err.println();
        System.err.println("  Bridge r3  [--listen 8891] [--power 10]");
        System.err.println("  Bridge ur4 [--listen 8892] [--reader 192.168.99.202:8888] [--power 30]");
        System.err.println("             [--antennas 1,2] [--alarm-ms 3000]");
        System.err.println();
        System.err.println("  --listen    agent ulanadigan port (faqat shu kompyuterdan)");
        System.err.println("  --reader    UR4 ning tarmoqdagi manzili");
        System.err.println("  --power     antenna quvvati, dBm (1-33)");
        System.err.println("  --antennas  UR4 da ulangan antennalar");
        System.err.println("  --alarm-ms  signal qancha vaqt chalinadi");
    }

    private static void log(String line) {
        System.out.println(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date()) + "  " + line);
    }

    private Bridge() {
    }
}
