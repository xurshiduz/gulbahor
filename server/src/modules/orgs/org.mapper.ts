import { DEFAULT_ORG_SETTINGS, type AnyCurrency, type OrgDto } from '@erp/core'
import type { EntityManager } from 'typeorm'

import type { Organization } from '../../database/entities'

/** The business with the currencies it has switched on, read in its own transaction. */
export async function orgDto(em: EntityManager, org: Organization): Promise<OrgDto> {
  const rows: { code: AnyCurrency }[] = await em.query(
    `SELECT code FROM org_currencies WHERE org_id = $1 AND is_active ORDER BY created_at`,
    [org.id],
  )
  return toOrgDto(
    org,
    rows.map((row) => row.code),
  )
}

function toOrgDto(org: Organization, currencies: AnyCurrency[]): OrgDto {
  return {
    id: org.id,
    name: org.name,
    timezone: org.timezone,
    baseCurrency: org.baseCurrency,
    currencies,
    costCurrency: org.costCurrency,
    modules: org.modules,
    settings: { ...DEFAULT_ORG_SETTINGS, ...org.settings },
    setupCompleted: org.setupCompleted,
  }
}
