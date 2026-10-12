import {
  customerBriefQuerySchema,
  customerGroupInputSchema,
  customerInputSchema,
  customerListQuerySchema,
  customerMergeSchema,
  customerQuickSchema,
  debtorListQuerySchema,
  dueChangeSchema,
  idSchema,
  loyaltyInputSchema,
  statementQuerySchema,
  type CustomerBriefDto,
  type CustomerBriefQuery,
  type CustomerDto,
  type CustomerGroupDto,
  type CustomerGroupInput,
  type CustomerInput,
  type CustomerListQuery,
  type CustomerMergeInput,
  type CustomerSummary,
  type LoyaltyInput,
  type LoyaltyTier,
  type CustomerQuickInput,
  type CustomerStatementDto,
  type DebtorDto,
  type DebtorListQuery,
  type DebtorSummary,
  type DueChangeInput,
  type Page,
  type StatementQuery,
} from '@erp/core'
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { AppError } from '../../common/errors'
import { zod } from '../../common/zod.pipe'
import { Actor, Can, can, CurrentActor } from '../auth/actor'
import { CustomersService } from './customers.service'
import { CustomerMergeService } from './merge.service'
import { CustomerPaymentsService } from './payments.service'

const id = () => Param('id', zod(idSchema))

/** Lets through whoever holds any one of the permissions. */
function anyOf(actor: Actor, ...permissions: string[]) {
  if (!permissions.some((permission) => can(actor, permission))) {
    throw AppError.forbidden()
  }
}

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly payments: CustomerPaymentsService,
    private readonly merges: CustomerMergeService,
  ) {}

  /**
   * Customers to pick among on a document, or to filter a list by: whoever makes receipts or sends goods back
   * picks the supplier here, and whoever may look at payments finds one customer's.
   */
  @Get('brief')
  brief(
    @CurrentActor() actor: Actor,
    @Query(zod(customerBriefQuerySchema)) query: CustomerBriefQuery,
  ): Promise<CustomerBriefDto[]> {
    anyOf(
      actor,
      'customers.view',
      'customers.receive',
      'customers.pay_out',
      'customers.debts',
      'customers.suppliers',
      'receipts.view',
      'supplier_returns.view',
    )
    return this.customers.brief(actor, query)
  }

  /** Someone named on a receipt for the first time, by name alone. */
  @Post('quick')
  quick(
    @CurrentActor() actor: Actor,
    @Body(zod(customerQuickSchema)) input: CustomerQuickInput,
  ): Promise<CustomerBriefDto> {
    anyOf(actor, 'customers.manage', 'receipts.manage')
    return this.customers.quick(actor, input)
  }

  /** Who owes the business, and what of it is late: the service says whose accounts this person keeps. */
  @Get('debtors')
  debtors(
    @CurrentActor() actor: Actor,
    @Query(zod(debtorListQuerySchema)) query: DebtorListQuery,
  ): Promise<Page<DebtorDto> & { summary: DebtorSummary }> {
    return this.customers.debtors(actor, query)
  }

  /** A debt given another day: the service says who may. */
  @Put('dues/:id')
  @HttpCode(204)
  moveDue(@CurrentActor() actor: Actor, @id() dueId: string, @Body(zod(dueChangeSchema)) input: DueChangeInput) {
    return this.customers.moveDue(actor, dueId, input)
  }

  /** One of a customer's accounts: every change, and what was owed after each. */
  @Get(':id/statement')
  statement(
    @CurrentActor() actor: Actor,
    @id() customerId: string,
    @Query(zod(statementQuerySchema)) query: StatementQuery,
  ): Promise<CustomerStatementDto> {
    return this.payments.statement(actor, customerId, query)
  }

  /** Whoever serves customers may see what the programme gives; whoever keeps the base sets it. */
  @Get('loyalty')
  @Can('customers.view')
  loyalty(@CurrentActor() actor: Actor): Promise<LoyaltyTier[]> {
    return this.customers.loyalty(actor)
  }

  @Put('loyalty')
  @Can('customers.manage')
  setLoyalty(@CurrentActor() actor: Actor, @Body(zod(loyaltyInputSchema)) input: LoyaltyInput): Promise<LoyaltyTier[]> {
    return this.customers.setLoyalty(actor, input)
  }

  /** Listed before the routes that take an id: `groups` is not a customer. */
  @Get('groups')
  @Can('customers.view')
  groups(@CurrentActor() actor: Actor): Promise<CustomerGroupDto[]> {
    return this.customers.groups(actor)
  }

  @Post('groups')
  @Can('customers.manage')
  createGroup(
    @CurrentActor() actor: Actor,
    @Body(zod(customerGroupInputSchema)) input: CustomerGroupInput,
  ): Promise<CustomerGroupDto> {
    return this.customers.createGroup(actor, input)
  }

  @Put('groups/:id')
  @Can('customers.manage')
  updateGroup(
    @CurrentActor() actor: Actor,
    @id() groupId: string,
    @Body(zod(customerGroupInputSchema)) input: CustomerGroupInput,
  ): Promise<CustomerGroupDto> {
    return this.customers.updateGroup(actor, groupId, input)
  }

  @Post('groups/:id/archive')
  @HttpCode(200)
  @Can('customers.manage')
  archiveGroup(@CurrentActor() actor: Actor, @id() groupId: string): Promise<CustomerGroupDto> {
    return this.customers.setGroupActive(actor, groupId, false)
  }

  @Post('groups/:id/restore')
  @HttpCode(200)
  @Can('customers.manage')
  restoreGroup(@CurrentActor() actor: Actor, @id() groupId: string): Promise<CustomerGroupDto> {
    return this.customers.setGroupActive(actor, groupId, true)
  }

  @Get()
  @Can('customers.view')
  list(
    @CurrentActor() actor: Actor,
    @Query(zod(customerListQuerySchema)) query: CustomerListQuery,
  ): Promise<Page<CustomerDto> & { summary: CustomerSummary }> {
    return this.customers.list(actor, query)
  }

  /** A card: for whoever keeps the book, and for whoever takes or makes the customer's payments. */
  @Get(':id')
  get(@CurrentActor() actor: Actor, @id() customerId: string): Promise<CustomerDto> {
    anyOf(actor, 'customers.view', 'customers.receive', 'customers.pay_out', 'customers.debts', 'customers.suppliers')
    return this.customers.get(actor, customerId)
  }

  @Post()
  @Can('customers.manage')
  create(@CurrentActor() actor: Actor, @Body(zod(customerInputSchema)) input: CustomerInput): Promise<CustomerDto> {
    return this.customers.create(actor, input)
  }

  @Put(':id')
  @Can('customers.manage')
  update(
    @CurrentActor() actor: Actor,
    @id() customerId: string,
    @Body(zod(customerInputSchema)) input: CustomerInput,
  ): Promise<CustomerDto> {
    return this.customers.update(actor, customerId, input)
  }

  @Post(':id/archive')
  @HttpCode(200)
  @Can('customers.manage')
  archive(@CurrentActor() actor: Actor, @id() customerId: string): Promise<CustomerDto> {
    return this.customers.setActive(actor, customerId, false)
  }

  @Post(':id/restore')
  @HttpCode(200)
  @Can('customers.manage')
  restore(@CurrentActor() actor: Actor, @id() customerId: string): Promise<CustomerDto> {
    return this.customers.setActive(actor, customerId, true)
  }

  /** One person written down twice: this card goes into another for good. Answers with the one that stays. */
  @Post(':id/merge')
  @HttpCode(200)
  @Can('customers.adjust')
  merge(
    @CurrentActor() actor: Actor,
    @id() customerId: string,
    @Body(zod(customerMergeSchema)) input: CustomerMergeInput,
  ): Promise<CustomerDto> {
    return this.merges.merge(actor, customerId, input)
  }
}
