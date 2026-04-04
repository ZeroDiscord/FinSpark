import * as Tabs from '@radix-ui/react-tabs'

export default function PlatformSelector({ value, onValueChange }) {
  return (
    <Tabs.Root value={value} onValueChange={onValueChange}>
      <Tabs.List className="inline-flex rounded-3xl border border-white/10 bg-white/5 p-2">
        <Tabs.Trigger
          value="web"
          className="rounded-2xl px-4 py-2 text-sm text-slate-300 data-[state=active]:bg-white/10 data-[state=active]:text-white"
        >
          Web
        </Tabs.Trigger>
        <Tabs.Trigger
          value="android"
          className="rounded-2xl px-4 py-2 text-sm text-slate-300 data-[state=active]:bg-white/10 data-[state=active]:text-white"
        >
          Android
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  )
}
