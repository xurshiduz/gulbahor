import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm'

const snake = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

/** camelCase in entities, snake_case in the database. */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
    return snake(embeddedPrefixes.concat(customName ?? propertyName).join('_'))
  }

  relationName(propertyName: string): string {
    return snake(propertyName)
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return snake(`${relationName}_${referencedColumnName}`)
  }
}
