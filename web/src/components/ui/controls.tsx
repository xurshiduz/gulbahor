import { Check, ChevronDown } from 'lucide-react'
import { Checkbox as CheckboxPrimitive, DropdownMenu, Select as SelectPrimitive, Switch as SwitchPrimitive, Tabs as TabsPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { controlClass } from './input'

// ───────────────────────────── Select ─────────────────────────────

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
}

/** A short, fixed list. Opens with Enter, Space or the arrows; typing jumps to a match. */
export function Select({ id, value, onChange, options, placeholder, invalid, disabled, className }: SelectProps) {
  return (
    <SelectPrimitive.Root value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(controlClass, 'flex items-center justify-between gap-2 text-left data-placeholder:text-ink-3', className)}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-ink-3" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-float data-[state=open]:animate-pop-in"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="flex h-8 items-center justify-between gap-3 rounded-md px-2 text-[13px] outline-none select-none data-highlighted:bg-sunken"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="size-3.5 text-accent" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

// ───────────────────────────── Checkbox and switch ─────────────────────────────

interface ToggleProps {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: ReactNode
  hint?: ReactNode
  className?: string
}

export function Checkbox({ id, checked, onChange, disabled, label, hint, className }: ToggleProps) {
  const box = (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={(next) => onChange(next === true)}
      disabled={disabled}
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded border border-control bg-surface transition-colors',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-on-accent',
        'disabled:opacity-50',
      )}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
  if (!label) {
    return box
  }
  return (
    <label className={cn('flex items-start gap-2.5', disabled && 'opacity-60', className)}>
      <span className="mt-0.5">{box}</span>
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {hint ? <span className="block text-xs text-ink-3">{hint}</span> : null}
      </span>
    </label>
  )
}

export function Switch({ id, checked, onChange, disabled, label, hint, className }: ToggleProps) {
  const control = (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent disabled:opacity-50',
      )}
    >
      <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4.5" />
    </SwitchPrimitive.Root>
  )
  if (!label) {
    return control
  }
  return (
    <label className={cn('flex items-start justify-between gap-4', disabled && 'opacity-60', className)}>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {hint ? <span className="block text-xs text-ink-3">{hint}</span> : null}
      </span>
      {control}
    </label>
  )
}

// ───────────────────────────── Tabs ─────────────────────────────

export function Tabs({
  value,
  onChange,
  tabs,
  children,
}: {
  value: string
  onChange: (value: string) => void
  tabs: { value: string; label: string }[]
  children: ReactNode
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onChange} className="flex min-h-0 flex-1 flex-col">
      <TabsPrimitive.List className="flex shrink-0 gap-1 border-b border-line">
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            className="-mb-px h-9 border-b-2 border-transparent px-3 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink"
          >
            {tab.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  )
}

export const TabPanel = ({ value, children }: { value: string; children: ReactNode }) => (
  <TabsPrimitive.Content value={value} className="min-h-0 flex-1 pt-5 outline-none">
    {children}
  </TabsPrimitive.Content>
)

// ───────────────────────────── Menu ─────────────────────────────

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
}

export function Menu({ trigger, items, align = 'end' }: { trigger: ReactNode; items: (MenuItem | 'separator')[]; align?: 'start' | 'end' }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          className="z-50 min-w-44 rounded-lg border border-line bg-surface p-1 shadow-float data-[state=open]:animate-pop-in"
        >
          {items.map((item, index) =>
            item === 'separator' ? (
              <DropdownMenu.Separator key={index} className="my-1 h-px bg-line" />
            ) : (
              <DropdownMenu.Item
                key={index}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  'flex h-8 items-center gap-2 rounded-md px-2 text-[13px] outline-none select-none data-highlighted:bg-sunken',
                  'data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:text-ink-3',
                  item.tone === 'danger' && 'text-bad [&_svg]:text-bad',
                )}
              >
                {item.icon}
                {item.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
