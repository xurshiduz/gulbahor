/**
 * Integratsiyalar ro'yxati. Har bir provayderning kalit maydonlari shu
 * yerda tavsiflanadi - sozlamalar sahifasi va tekshiruv shundan quriladi.
 * Kalitlar (secret) bazada shifrlangan holda saqlanadi.
 */

export type ProviderKind = 'PAYMENT' | 'MARKETPLACE';

/**
 * Qanday ishlaydi:
 *  - click / payme / uds - API orqali to'liq
 *  - manual - API hujjati yo'q: kassir terminaldagi to'lovdan keyin
 *    tranzaksiya raqamini (RRN) kiritadi
 *  - wildberries / ozon / uzum-market - qoldiqni yuborish
 */
export type ProviderApi = 'click' | 'payme' | 'uds' | 'manual' | 'wildberries' | 'ozon' | 'uzum-market';

export interface ProviderField {
  key: string;
  /** Maxfiy kalit: API javobida ko'rsatilmaydi, bazada shifrlanadi */
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
}

export interface ProviderDef {
  code: string;
  kind: ProviderKind;
  title: string;
  api: ProviderApi;
  fields: ProviderField[];
  /** Test (sandbox) va haqiqiy rejim alohida manzilga ega */
  hasTestMode?: boolean;
  docsUrl?: string;
}

export const PROVIDERS: ProviderDef[] = [
  /* ------------------------------- To'lovlar ------------------------------- */
  {
    code: 'PAYME', kind: 'PAYMENT', title: 'Payme', api: 'payme', hasTestMode: true,
    docsUrl: 'https://developer.help.paycom.uz',
    fields: [
      { key: 'merchantId', required: true, placeholder: '5e730e8e0b852a417aa49ceb' },
      { key: 'key', secret: true, required: true },
    ],
  },
  {
    code: 'CLICK', kind: 'PAYMENT', title: 'Click Pass', api: 'click',
    docsUrl: 'https://docs.click.uz',
    fields: [
      { key: 'serviceId', required: true, placeholder: '12345' },
      { key: 'merchantUserId', required: true, placeholder: '12345' },
      { key: 'secretKey', secret: true, required: true },
      { key: 'cashboxCode' },
    ],
  },
  {
    code: 'UDS', kind: 'PAYMENT', title: 'UDS', api: 'uds',
    docsUrl: 'https://docs.uds.app',
    fields: [
      { key: 'companyId', required: true, placeholder: '549755813888' },
      { key: 'apiKey', secret: true, required: true },
    ],
  },
  {
    code: 'ARCA', kind: 'PAYMENT', title: 'Arca terminali', api: 'manual',
    fields: [{ key: 'terminalId' }],
  },
  {
    code: 'UZUM_PAY', kind: 'PAYMENT', title: 'Uzum', api: 'manual',
    fields: [{ key: 'merchantId' }],
  },

  /* ------------------------------ Marketpleyslar ------------------------------ */
  {
    code: 'UZUM_MARKET', kind: 'MARKETPLACE', title: 'Uzum Market', api: 'uzum-market',
    docsUrl: 'https://api-seller.uzum.uz/api/seller-openapi/swagger/swagger-ui',
    fields: [
      { key: 'token', secret: true, required: true },
      { key: 'shopId', required: true, placeholder: '12345' },
    ],
  },
  {
    code: 'WILDBERRIES', kind: 'MARKETPLACE', title: 'Wildberries', api: 'wildberries',
    docsUrl: 'https://dev.wildberries.ru',
    fields: [{ key: 'token', secret: true, required: true }],
  },
  {
    code: 'OZON', kind: 'MARKETPLACE', title: 'Ozon', api: 'ozon',
    docsUrl: 'https://docs.ozon.ru/api/seller',
    fields: [
      { key: 'clientId', required: true, placeholder: '123456' },
      { key: 'apiKey', secret: true, required: true },
    ],
  },
];

export const providerByCode = (code: string) => PROVIDERS.find((provider) => provider.code === code);
