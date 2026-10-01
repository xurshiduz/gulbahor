import { Foundation1790000000000 } from './1790000000000-foundation'
import { Catalog1790000001000 } from './1790000001000-catalog'
import { Receiving1790000002000 } from './1790000002000-receiving'
import { StockDocuments1790000003000 } from './1790000003000-stock-documents'

/** Listed by hand, oldest first, so the same set runs from source and from the build. */
export const MIGRATIONS = [
  Foundation1790000000000,
  Catalog1790000001000,
  Receiving1790000002000,
  StockDocuments1790000003000,
]
