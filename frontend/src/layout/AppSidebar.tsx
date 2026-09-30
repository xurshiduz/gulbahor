import { useCallback, useState, useEffect } from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { GridIcon, UserCircleIcon, ChevronDownIcon } from "../icons";
import { useSidebar } from "../context/SidebarContext";
import { usePermissions } from "../hooks/usePermissions";
import { Boxes, Building2, Calculator, ClipboardList, Layers, Megaphone, MonitorSmartphone, Package, PackageMinus, PackagePlus, Plug, Users } from "lucide-react";
import { openPos } from "../utils/pos";

/**
 * Menyu punkti. `resource` - shu bo'limni ko'rish huquqi (bo'lmasa hammaga
 * ochiq). `permission` - aniq huquq nomi (masalan "update:roles"):
 * ko'rish huquqi bo'lmasa ham shu huquq bo'lsa punkt chiqadi.
 */
interface NavSubItem {
  name: string;
  path: string;
  resource?: string;
  permission?: string;
}

interface NavItem {
  icon?: React.ReactNode;
  name: string;
  path?: string;
  /** Bosilganda alohida oynada ochiladi (kassa) */
  onOpen?: () => void;
  resource?: string;
  permission?: string;
  subItems?: NavSubItem[];
}

const AppSidebar: React.FC = () => {
  const { t } = useTranslation();
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleMobileSidebar } = useSidebar();
  // Telefonda menyu punkti bosilganda sahifa ochilib, menyu yopiladi
  const closeOnMobile = () => { if (isMobileOpen) toggleMobileSidebar(); };
  const { canView, can } = usePermissions();
  const location = useLocation();
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  const isActive = useCallback(
    (path: string) => {
      if (path === '/') return location.pathname === '/';
      return location.pathname === path || location.pathname.startsWith(path + '/');
    },
    [location.pathname]
  );

  const toggleSubmenu = (name: string) => {
    setOpenSubmenu(openSubmenu === name ? null : name);
  };

  /**
   * Menyu. Yangi bo'lim shu yerga qo'shiladi (config/modules.tsx dagi
   * izohga qarang). Ichki punktli bo'lim `subItems` bilan beriladi.
   */
  const navItems: NavItem[] = [
    {
      icon: <GridIcon />,
      name: t("sidebar.dashboard"),
      path: "/",
    },
    {
      icon: <UserCircleIcon />,
      name: t("sidebar.users"),
      subItems: [
        { name: t("sidebar.users_list"), path: "/users", resource: "users" },
        { name: t("sidebar.roles"), path: "/roles", resource: "roles" },
      ],
    },
    {
      icon: <Building2 />,
      name: t("sidebar.administration"),
      subItems: [
        { name: t("modules.organizations.title"), path: "/organizations", resource: "organizations" },
        { name: t("modules.branches.title"), path: "/branches", resource: "branches" },
        { name: t("modules.warehouses.title"), path: "/warehouses", resource: "warehouses" },
        { name: t("modules.cashRegisters.title"), path: "/cash-registers", resource: "cash-registers" },
      ],
    },
    {
      icon: <Users />,
      name: t("sidebar.contractors"),
      subItems: [
        { name: t("modules.customers.title"), path: "/customers", resource: "customers" },
        { name: t("modules.suppliers.title"), path: "/suppliers", resource: "suppliers" },
      ],
    },
    {
      icon: <PackagePlus />,
      name: t("modules.inbounds.title"),
      path: "/inbounds",
      resource: "inbound-documents",
    },
    {
      icon: <PackageMinus />,
      name: t("modules.outbounds.title"),
      path: "/outbounds",
      resource: "outbound-documents",
    },
    {
      icon: <Boxes />,
      name: t("modules.stock.title"),
      path: "/stock",
      resource: "stock",
    },
    {
      icon: <ClipboardList />,
      name: t("modules.inventory.title"),
      path: "/inventory",
      resource: "inventory",
    },
    {
      icon: <MonitorSmartphone />,
      name: t("modules.pos.title"),
      path: "/pos",
      resource: "pos",
      onOpen: openPos,
    },
    {
      icon: <Megaphone />,
      name: t("sidebar.marketing"),
      subItems: [
        { name: t("modules.giftCertificates.title"), path: "/gift-certificates", resource: "gift-certificates" },
        { name: t("modules.discountPromotions.title"), path: "/promotions/discounts", resource: "promotions" },
        { name: t("modules.giftPromotions.title"), path: "/promotions/gifts", resource: "promotions" },
        { name: t("modules.carouselPromotions.title"), path: "/promotions/carousel", resource: "promotions" },
        { name: t("modules.receiptPromotions.title"), path: "/promotions/receipt", resource: "promotions" },
      ],
    },
    {
      icon: <Calculator />,
      name: t("sidebar.accounting"),
      subItems: [
        { name: t("modules.expenses.title"), path: "/expenses", resource: "payments" },
        { name: t("modules.receipts.title"), path: "/receipts", resource: "payments" },
        { name: t("modules.cashBalance.title"), path: "/cash-balance", resource: "cash-balance" },
        { name: t("modules.cashWithdrawals.title"), path: "/cash-withdrawals", resource: "cash-withdrawals" },
        { name: t("modules.currencies.title"), path: "/currencies", resource: "currencies" },
        { name: t("modules.currencyRates.title"), path: "/currency-rates", resource: "currency-rates" },
        { name: t("modules.paymentTypes.title"), path: "/payment-types", resource: "payment-types" },
        { name: t("modules.expenseTypes.title"), path: "/expense-types", resource: "expense-types" },
      ],
    },
    {
      icon: <Plug />,
      name: t("sidebar.integrations"),
      subItems: [
        { name: t("modules.paymentIntegrations.title"), path: "/integrations/payments", resource: "integrations" },
        { name: t("modules.marketplaceIntegrations.title"), path: "/integrations/marketplaces", resource: "integrations" },
      ],
    },
    {
      icon: <Package />,
      name: t("modules.materials.title"),
      path: "/materials",
      resource: "materials",
    },
    {
      icon: <Layers />,
      name: t("sidebar.material_data"),
      subItems: [
        { name: t("modules.categories.title"), path: "/categories", resource: "product-categories" },
        { name: t("modules.brands.title"), path: "/brands", resource: "product-brands" },
        { name: t("modules.units.title"), path: "/units", resource: "product-units" },
        { name: t("modules.colors.title"), path: "/colors", resource: "colors" },
        { name: t("modules.sizes.title"), path: "/sizes", resource: "sizes" },
        { name: t("modules.countries.title"), path: "/countries", resource: "countries" },
        { name: t("modules.regions.title"), path: "/regions", resource: "regions" },
      ],
    },
  ];

  /**
   * Faqat foydalanuvchida "Ko'rish" huquqi bor bo'limlar ko'rsatiladi.
   * Ichki punktlari qolmagan bo'lim butunlay yashiriladi.
   */
  const allowed = (item: { resource?: string; permission?: string }) =>
    (!item.resource && !item.permission)
    || (!!item.resource && canView(item.resource))
    || (!!item.permission && can(item.permission));
  const visibleNavItems = navItems
    .map((nav) =>
      nav.subItems
        ? { ...nav, subItems: nav.subItems.filter(allowed) }
        : nav,
    )
    .filter((nav) => (nav.subItems ? nav.subItems.length > 0 : allowed(nav)));

  useEffect(() => {
    const activeParent = navItems.find(nav =>
      nav.subItems?.some(sub => isActive(sub.path))
    );
    if (activeParent) {
      setOpenSubmenu(activeParent.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-[calc(100dvh-4rem)] lg:h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-4 flex ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link to="/">
          {isExpanded || isHovered || isMobileOpen ? (
            <>
              <img
                className="dark:hidden"
                src="/images/logo/logo.svg"
                alt="Gulbahor"
                width={150}
                height={40}
              />
              <img
                className="hidden dark:block"
                src="/images/logo/logo-dark.svg"
                alt="Gulbahor"
                width={150}
                height={40}
              />
            </>
          ) : (
            <img
              src="/images/logo/logo-icon.svg"
              alt="Gulbahor"
              width={32}
              height={32}
            />
          )}
        </Link>
      </div>
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-1">
            <div>
              <ul className="flex flex-col gap-1">
                {visibleNavItems.map((nav) => {
                  const isParentActive = nav.subItems?.some(sub => isActive(sub.path));

                  return (
                  <li key={nav.name}>
                    {nav.subItems ? (
                      <>
                        <button
                          onClick={() => toggleSubmenu(nav.name)}
                          className={`menu-item group w-full justify-between ${isParentActive ? "menu-item-active" : "menu-item-inactive"}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`menu-item-icon-size ${isParentActive ? "menu-item-icon-active" : "menu-item-icon-inactive"}`}>
                              {nav.icon}
                            </span>
                            {(isExpanded || isHovered || isMobileOpen) && (
                              <span className="menu-item-text">{nav.name}</span>
                            )}
                          </div>
                          {(isExpanded || isHovered || isMobileOpen) && (
                            <ChevronDownIcon
                              className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${openSubmenu === nav.name ? 'rotate-180' : ''}`}
                            />
                          )}
                        </button>
                        {(isExpanded || isHovered || isMobileOpen) && openSubmenu === nav.name && (
                          <ul className="mt-1 flex flex-col gap-1 pl-9">
                            {nav.subItems.map((sub) => (
                              <li key={sub.path}>
                                <Link
                                  to={sub.path}
                                  onClick={closeOnMobile}
                                  className={`menu-item group ${
                                    isActive(sub.path) ? "menu-item-active" : "menu-item-inactive"
                                  } !py-2 !text-sm`}
                                >
                                  <span className="menu-item-text">{sub.name}</span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <Link
                        to={nav.path!}
                        onClick={(event) => {
                          // Kassa alohida to'liq ekranli oynada ochiladi
                          if (nav.onOpen) { event.preventDefault(); nav.onOpen(); }
                          closeOnMobile();
                        }}
                        className={`menu-item group ${
                          isActive(nav.path!) ? "menu-item-active" : "menu-item-inactive"
                        }`}
                      >
                        {nav.icon && (
                          <span
                            className={`menu-item-icon-size ${
                              isActive(nav.path!)
                                ? "menu-item-icon-active"
                                : "menu-item-icon-inactive"
                            }`}
                          >
                            {nav.icon}
                          </span>
                        )}
                        {/* Ikonkasiz punktlar yig'ilgan holatda ham nomi bilan ko'rinadi */}
                        {(isExpanded || isHovered || isMobileOpen || !nav.icon) && (
                          <span className="menu-item-text">{nav.name}</span>
                        )}
                      </Link>
                    )}
                  </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
