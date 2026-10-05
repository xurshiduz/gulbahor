import {
  customerGroupInputSchema,
  customerInputSchema,
  customerListQuerySchema,
  idSchema,
  type CustomerDto,
  type CustomerGroupDto,
  type CustomerGroupInput,
  type CustomerInput,
  type CustomerListQuery,
  type CustomerSummary,
  type Page,
} from '@gulbahor/core'
import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'

import { zod } from '../../common/zod.pipe'
import { Actor, Can, CurrentActor } from '../auth/actor'
import { CustomersService } from './customers.service'

const id = () => Param('id', zod(idSchema))

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

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

  @Get(':id')
  @Can('customers.view')
  get(@CurrentActor() actor: Actor, @id() customerId: string): Promise<CustomerDto> {
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
}
