import { Check, ChevronDown } from 'lucide-react'
import {
  Checkbox as CheckboxPrimitive,
  DropdownMenu,
  Select as SelectPrimitive,
  Switch as SwitchPrimitive,
  Tabs as TabsPrimitive,
} from 'radix-ui'
import { useEffect, useRef, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { Shortcut } from './feedback'
import { controlClass } from './input'
import { usePageBarSlot } from './page'

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
        className={cn(
          controlClass,
          'flex items-center justify-between gap-2 text-left data-placeholder:text-ink-3',
          className,
        )}
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

/**
 * Inside a form Radix adds a hidden, absolutely positioned input next to the
 * control. This gives it something to be positioned against; without it the
 * input escapes every scrolling container and stretches the page.
 */
const anchor = 'relative inline-flex shrink-0'

export function Checkbox({ id, checked, onChange, disabled, label, hint, className }: ToggleProps) {
  const box = (
    <span className={anchor}>
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
    </span>
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
    <span className={anchor}>
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
    </span>
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
  const actionsRef = usePageBarSlot('tabs')
  const listRef = useRef<HTMLDivElement>(null)
  // In a window too narrow for all of them, the tab in view may lie beyond the edge.
  useEffect(() => {
    listRef.current?.querySelector('[data-state=active]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [value])
  return (
    <TabsPrimitive.Root value={value} onValueChange={onChange} className="flex min-h-0 flex-1 flex-col">
      {/* The rule runs under the whole row and the screen's buttons stand on it, centred on the tabs' names;
          the row is tall enough that they keep clear of it. Short of room the buttons go up a line rather than
          down (wrap-reverse), so the tabs stay on the rule. */}
      <div className="flex shrink-0 flex-wrap-reverse items-center gap-x-4 border-b border-line">
        {/* More tabs than a narrow window has room for are scrolled along, not pushed out of the page.
            The first name starts where the content below does. */}
        <TabsPrimitive.List
          ref={listRef}
          className="-mb-px -ml-1 flex max-w-full min-w-0 gap-3 overflow-x-auto [scrollbar-width:none]"
        >
          {tabs.map((tab) => (
            <TabsPrimitive.Trigger
              key={tab.value}
              value={tab.value}
              className="relative h-11 shrink-0 px-1 text-[13px] font-medium whitespace-nowrap text-ink-2 transition-colors after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors hover:text-ink hover:after:bg-line-strong focus-visible:-outline-offset-2 data-[state=active]:text-ink data-[state=active]:after:bg-accent"
            >
              {tab.label}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
        {/* The buttons of the screen, or of the tab in view. */}
        {actionsRef ? (
          <div ref={actionsRef} className="ml-auto flex flex-wrap items-center gap-2 py-1 empty:hidden" />
        ) : null}
      </div>
      {children}
    </TabsPrimitive.Root>
  )
}

export const TabPanel = ({ value, children }: { value: string; children: ReactNode }) => (
  <TabsPrimitive.Content value={value} className="flex min-h-0 flex-1 flex-col pt-3 outline-none">
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
  /** The key that does the same, shown beside it. */
  shortcut?: string
}

export function Menu({
  trigger,
  items,
  align = 'end',
}: {
  trigger: ReactNode
  items: (MenuItem | 'separator')[]
  align?: 'start' | 'end'
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          className="z-50 min-w-44 rounded-lg border border-line bg-surface p-1 shadow-float data-[state=open]:animate-pop-in"
          // A dialog opened from the menu has already put the cursor in its first field: the closing menu must not take it back.
          onCloseAutoFocus={(event) => {
            if (document.activeElement?.closest('[role="dialog"]')) {
              event.preventDefault()
            }
          }}
        >
          {items.map((item, index) =>
            item === 'separator' ? (
              <DropdownMenu.Separator key={index} className="my-1 h-px bg-line" />
            ) : (
              <DropdownMenu.Item
                key={index}
                disabled={item.disabled}
                // The open menu holds the focus. What was chosen runs once it has let go, so a dialog it opens keeps the cursor in its field.
                onSelect={() => window.setTimeout(item.onSelect)}
                className={cn(
                  'flex h-8 items-center gap-2 rounded-md px-2 text-[13px] outline-none select-none data-highlighted:bg-sunken',
                  'data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:text-ink-3',
                  item.tone === 'danger' && 'text-bad [&_svg]:text-bad',
                )}
              >
                {item.icon}
                {item.label}
                {item.shortcut ? <Shortcut combo={item.shortcut} className="ml-auto pl-3" /> : null}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
