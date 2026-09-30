import { BrowserRouter as Router, Routes, Route } from "react-router";
import SignIn from "./pages/AuthPages/SignIn";
import NotFound from "./pages/NotFound";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import Users from "./pages/Users/Users";
import Roles from "./pages/Users/Roles";
import Profile from "./pages/AuthPages/Profile";
import Sessions from "./pages/AuthPages/Sessions";
import Organizations from "./pages/Administration/Organizations";
import Branches from "./pages/Administration/Branches";
import Warehouses from "./pages/Administration/Warehouses";
import Customers from "./pages/Contractors/Customers";
import Suppliers from "./pages/Contractors/Suppliers";
import InboundsList from "./pages/Inbounds/InboundsList";
import InboundForm from "./pages/Inbounds/InboundForm";
import OutboundsList from "./pages/Outbounds/OutboundsList";
import OutboundForm from "./pages/Outbounds/OutboundForm";
import { Expenses, Receipts } from "./pages/Accounting/Payments";
import Stock from "./pages/Stock/Stock";
import Pos from "./pages/Pos/Pos";
import CashRegisters from "./pages/Cash/CashRegisters";
import CashBalance from "./pages/Cash/CashBalance";
import CashWithdrawals from "./pages/Cash/CashWithdrawals";
import PermissionGate from "./components/auth/PermissionGate";
import { MarketplaceIntegrations, PaymentIntegrations } from "./pages/Integrations/Integrations";
import GiftCertificates from "./pages/Marketing/GiftCertificates";
import { CarouselPromotions, DiscountPromotions, GiftPromotions, ReceiptPromotions } from "./pages/Marketing/Promotions";
import Currencies from "./pages/Accounting/Currencies";
import CurrencyRates from "./pages/Accounting/CurrencyRates";
import { ExpenseTypes, PaymentTypes } from "./pages/Accounting/NamedReference";
import Materials from "./pages/Materials/Materials";
import Categories from "./pages/References/Categories";
import Brands from "./pages/References/Brands";
import Units from "./pages/References/Units";
import Colors from "./pages/References/Colors";
import Sizes from "./pages/References/Sizes";
import Countries from "./pages/References/Countries";
import Regions from "./pages/References/Regions";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <Routes>
          {/* Dashboard Layout (Protected) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index path="/" element={<Home />} />
              <Route path="/users" element={<Users />} />
              <Route path="/roles" element={<Roles />} />

              {/* Ma'muriyat */}
              <Route path="/organizations" element={<Organizations />} />
              <Route path="/branches" element={<Branches />} />
              <Route path="/warehouses" element={<Warehouses />} />
              <Route path="/cash-registers" element={<CashRegisters />} />

              {/* Kontragentlar */}
              <Route path="/customers" element={<Customers />} />
              <Route path="/suppliers" element={<Suppliers />} />

              {/* Kirim hujjatlari */}
              <Route path="/inbounds" element={<InboundsList />} />
              <Route path="/inbounds/create" element={<InboundForm />} />
              <Route path="/inbounds/:id" element={<InboundForm />} />

              {/* Chiqim hujjatlari (sotuvlar) */}
              <Route path="/outbounds" element={<OutboundsList />} />
              <Route path="/outbounds/create" element={<OutboundForm />} />
              <Route path="/outbounds/:id" element={<OutboundForm />} />

              {/* Ombor qoldig'i */}
              <Route path="/stock" element={<Stock />} />

              {/* Marketing vositalari */}
              <Route path="/gift-certificates" element={<GiftCertificates />} />
              <Route path="/promotions/discounts" element={<DiscountPromotions />} />
              <Route path="/promotions/gifts" element={<GiftPromotions />} />
              <Route path="/promotions/carousel" element={<CarouselPromotions />} />
              <Route path="/promotions/receipt" element={<ReceiptPromotions />} />

              {/* Buhgalteriya */}
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/receipts" element={<Receipts />} />
              <Route path="/cash-balance" element={<CashBalance />} />
              <Route path="/cash-withdrawals" element={<CashWithdrawals />} />

              {/* Integratsiyalar */}
              <Route path="/integrations/payments" element={<PaymentIntegrations />} />
              <Route path="/integrations/marketplaces" element={<MarketplaceIntegrations />} />
              <Route path="/currencies" element={<Currencies />} />
              <Route path="/currency-rates" element={<CurrencyRates />} />
              <Route path="/payment-types" element={<PaymentTypes />} />
              <Route path="/expense-types" element={<ExpenseTypes />} />

              <Route path="/materials" element={<Materials />} />

              {/* Material ma'lumotlari */}
              <Route path="/categories" element={<Categories />} />
              <Route path="/brands" element={<Brands />} />
              <Route path="/units" element={<Units />} />
              <Route path="/colors" element={<Colors />} />
              <Route path="/sizes" element={<Sizes />} />
              <Route path="/countries" element={<Countries />} />
              <Route path="/regions" element={<Regions />} />

              <Route path="/profile" element={<Profile />} />
              <Route path="/sessions" element={<Sessions />} />
            </Route>

            {/* Kassa (POS) - menyusiz, to'liq ekranli alohida oyna */}
            <Route path="/pos" element={<PermissionGate><Pos /></PermissionGate>} />
          </Route>

          {/* Auth Layout */}
          <Route path="/signin" element={<SignIn />} />

          {/* Fallback Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
