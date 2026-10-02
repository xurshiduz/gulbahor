import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { TabPanel, Tabs } from '@/components/ui/controls'
import { Page } from '@/components/ui/page'
import { useSession } from '@/features/auth/session'
import { api } from '@/lib/api'

import { AttributesTab } from './attributes-tab'
import { BrandsTab } from './brands-tab'
import { useAttributes, useCategories } from './catalog'
import { CategoriesTab } from './categories-tab'
import { PriceTypesTab } from './price-types-tab'

const route = getRouteApi('/references')

/** The lists models are described with: where they belong, who made them, what they come in, what they cost. */
export function ReferencesPage() {
  const { t } = useTranslation()
  const { can } = useSession()
  const { tab } = route.useSearch()
  const navigate = route.useNavigate()
  const queryClient = useQueryClient()
  const canManage = can('products.references')

  const attributes = useAttributes()
  const categories = useCategories()

  const starter = useMutation({
    mutationFn: () => api.post<{ applied: boolean }>('/catalog/starter'),
    onSuccess: ({ applied }) => {
      void queryClient.invalidateQueries({ queryKey: ['attributes'] })
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
      if (applied) {
        toast.success(t('references.starterDone'))
      }
    },
  })

  // Offered only to a business whose lists are both still empty: it never doubles what is there.
  const starterButton =
    canManage && attributes.data?.length === 0 && categories.data?.length === 0 ? (
      <Button variant="primary" size="sm" loading={starter.isPending} onClick={() => starter.mutate()}>
        <Sparkles />
        {t('references.starter')}
      </Button>
    ) : null

  return (
    <Page title={t('references.title')}>
      <Tabs
        value={tab}
        onChange={(value) => void navigate({ search: { tab: value as typeof tab } })}
        tabs={[
          { value: 'categories', label: t('references.tabCategories') },
          { value: 'brands', label: t('references.tabBrands') },
          { value: 'attributes', label: t('references.tabAttributes') },
          { value: 'prices', label: t('references.tabPrices') },
        ]}
      >
        <TabPanel value="categories">
          <CategoriesTab canManage={canManage} starter={starterButton} />
        </TabPanel>
        <TabPanel value="brands">
          <BrandsTab canManage={canManage} />
        </TabPanel>
        <TabPanel value="attributes">
          <AttributesTab canManage={canManage} starter={starterButton} />
        </TabPanel>
        <TabPanel value="prices">
          <PriceTypesTab canManage={can('products.prices')} />
        </TabPanel>
      </Tabs>
    </Page>
  )
}
