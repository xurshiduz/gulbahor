/** Node.js put beside the agent where the computer has none (or one too old): a single file, nothing installed. */
export const AGENT_NODE_URL = 'https://nodejs.org/dist/v22.14.0/win-x64/node.exe'

/** The agent as one file, served by the system itself; every start of the agent fetches it afresh. */
export const AGENT_FILE = '/agent/erp-agent.cjs'

const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`

/**
 * The file that sets a shop computer up: opened with a double click, it brings Node.js where it is missing, takes
 * the agent from the system, writes its key, puts it into Windows' start-up for this user (no administrator
 * needed) and starts it out of sight. Opened again — with a new key, on the same computer — it puts the newer in
 * place of the older and keeps the rest of `agent.json` (USB printers).
 *
 * A `.cmd` file whose lines after the marker are PowerShell, read by PowerShell from the file itself: one file
 * to send, nothing to unpack. `SAVDO_AGENT_DIR` and `SAVDO_NO_STARTUP` exist for trying it out.
 */
export function agentInstaller(url: string, key: string): string {
  const origin = url.replace(/\/+$/, '')
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
    `$url = ${quoted(origin)}`,
    `$key = ${quoted(key)}`,
    "$dir = if ($env:SAVDO_AGENT_DIR) { $env:SAVDO_AGENT_DIR } else { Join-Path $env:LOCALAPPDATA 'SavdoAgent' }",
    'New-Item -ItemType Directory -Force $dir | Out-Null',
    // PowerShell reads ‘ and ’ as quote marks: text with them goes in double quotes.
    'Write-Host "Savdo agenti o‘rnatilmoqda..." -ForegroundColor Cyan',
    '',
    '# The agent running now, if any, is stopped first: its files are about to be replaced.',
    'Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -like "*$dir*" -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    '',
    "$node = Join-Path $dir 'node.exe'",
    'if (-not (Test-Path $node)) {',
    '  $found = Get-Command node -ErrorAction SilentlyContinue',
    "  if ($found -and ((& $found.Source -v) -match '^v(2[0-9]|[3-9][0-9])\\.')) { $node = $found.Source }",
    '  else {',
    "    Write-Host 'Node.js yuklab olinmoqda (~80 MB), biroz kuting...'",
    `    Invoke-WebRequest ${quoted(AGENT_NODE_URL)} -OutFile $node -UseBasicParsing`,
    '  }',
    '}',
    '',
    "Write-Host 'Agent yuklab olinmoqda...'",
    `Invoke-WebRequest ($url + ${quoted(AGENT_FILE)}) -OutFile (Join-Path $dir 'erp-agent.cjs') -UseBasicParsing`,
    '',
    "$configFile = Join-Path $dir 'agent.json'",
    '$config = if (Test-Path $configFile) { Get-Content -Raw $configFile | ConvertFrom-Json } else { [pscustomobject]@{} }',
    '$config | Add-Member -NotePropertyName url -NotePropertyValue $url -Force',
    '$config | Add-Member -NotePropertyName key -NotePropertyValue $key -Force',
    '[IO.File]::WriteAllText($configFile, ($config | ConvertTo-Json -Depth 5))',
    '',
    '# Started again whenever it stops; the system turning its key away (code 2) is the one end. Each start takes',
    '# the newest agent from the system, the one already here where the system cannot be reached.',
    '$run = @(',
    "  '@echo off'",
    '  \'cd /d "%~dp0"\'',
    "  ':loop'",
    `  ('powershell -NoProfile -Command "try { Invoke-WebRequest ''' + $url + ${quoted(AGENT_FILE)} + ''' -OutFile erp-agent.new -UseBasicParsing; Move-Item -Force erp-agent.new erp-agent.cjs } catch {}"')`,
    '  (\'"\' + $node + \'" "%~dp0erp-agent.cjs" >> agent.log 2>&1\')',
    "  'if %errorlevel%==2 exit /b'",
    "  'timeout /t 10 /nobreak >nul'",
    "  'goto loop'",
    ')',
    '[IO.File]::WriteAllText((Join-Path $dir \'run.cmd\'), ($run -join "`r`n") + "`r`n")',
    '$hidden = \'CreateObject("WScript.Shell").Run """\' + (Join-Path $dir \'run.cmd\') + \'""", 0, False\'',
    "$launcher = Join-Path $dir 'start.vbs'",
    '[IO.File]::WriteAllText($launcher, $hidden)',
    '',
    'if (-not $env:SAVDO_NO_STARTUP) {',
    "  Copy-Item -Force $launcher (Join-Path ([Environment]::GetFolderPath('Startup')) 'SavdoAgent.vbs')",
    '}',
    '',
    '# The "Savdo" shortcut: the system in a window of its own that prints with no dialog, to Windows\' default',
    '# printer — the receipt printer the system sets. The computer\'s own browser where it can print so (Chrome,',
    '# Edge, Yandex, Brave — all Chromium), Edge where it cannot (Firefox). Its own profile, so the browser',
    '# already open does not swallow the window and its silent printing with it.',
    '$browser = $null',
    'try {',
    "  $progId = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice' -ErrorAction Stop).ProgId",
    "  $command = (Get-ItemProperty (\"Registry::HKEY_CLASSES_ROOT\\$progId\\shell\\open\\command\") -ErrorAction Stop).'(default)'",
    "  if ($command -match '^\\s*\"([^\"]+)\"' -or $command -match '^\\s*(\\S+\\.exe)') { $browser = $Matches[1] }",
    "  if ($browser -and ((Split-Path $browser -Leaf) -notin @('chrome.exe', 'msedge.exe', 'browser.exe', 'brave.exe'))) { $browser = $null }",
    '} catch { }',
    'if (-not $browser) {',
    '  $browser = @("${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe", "$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1',
    '}',
    '$edge = $browser',
    'if ($edge -and -not $env:SAVDO_NO_STARTUP) {',
    "  $link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Savdo.lnk'))",
    '  $link.TargetPath = $edge',
    "  $link.Arguments = ('--app=' + $url + ' --kiosk-printing --user-data-dir=\"' + (Join-Path $dir 'browser') + '\"')",
    '  $link.IconLocation = $edge',
    '  $link.Save()',
    '  Write-Host "Ish stolida «Savdo» yorlig‘i paydo bo‘ldi: chek undan oynasiz chiqadi."',
    '}',
    '& wscript.exe $launcher',
    '',
    "Write-Host ''",
    'Write-Host "Tayyor: agent ishga tushdi va kompyuter yonganda o‘zi ishlaydi." -ForegroundColor Green',
    'Write-Host "Tizimda «Qurilmalar» sahifasida u «Ulangan» bo‘lib ko‘rinadi."',
    "Write-Host ('Jurnal: ' + (Join-Path $dir 'agent.log'))",
  ]
  const head = [
    '@echo off',
    'chcp 65001 >nul',
    // The marker is put together here so that this line itself is not where the file is cut.
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$t = Get-Content -Raw -Encoding UTF8 '%~f0'; $m = '#' + 'SAVDO#'; Invoke-Expression ($t.Substring($t.IndexOf($m) + $m.Length))\"",
    'echo.',
    'pause',
    'exit /b',
    '#SAVDO#',
  ]
  return [...head, ...script, ''].join('\r\n')
}

/** Hands the person the file to open on the shop computer. */
export function downloadAgentInstaller(url: string, key: string, name: string) {
  const blob = new Blob([agentInstaller(url, key)], { type: 'application/octet-stream' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  const safe = name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'agent'
  link.download = `Savdo-agent-${safe}.cmd`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
