# 🎨 Design System

Binding design guidelines for all screens of the mAirList webinterface. The base is the look of the TubeLive screenshots. Every new screen uses exactly these tokens and patterns so everything feels like a single, coherent piece.

## Colors (Tailwind classes)

| Role | Class | Purpose |
|---|---|---|
| Main background | `bg-zinc-950` | Content area, table |
| Panel background | `bg-zinc-900` | Nav sidebar, tree, cards |
| Hover and active area | `bg-zinc-800` | Row hover, active nav |
| Border | `border-zinc-800` | all dividers |
| Primary text | `text-zinc-100` | Titles, values |
| Secondary text | `text-zinc-400` | Labels, type |
| Muted text | `text-zinc-500` / `text-zinc-600` | IDs, meta, placeholders |
| Accent | `orange-500` | Logo, active markers, focus |
| Primary action | `green-600` | Save, edit, new element |
| Delete action | `red-600` | Delete |

Cue point colors live in the data source (`CUE_POINTS`), not here, because they are data.

## Layout

Three-column base layout spanning the full height (`h-screen`):

```
┌──────────┬───────────────┬─────────────────────────────┐
│ Nav      │ Context       │ Content                      │
│ w-52     │ w-64          │ flex-1                       │
│ Sidebar  │ Tree OR       │ Header, toolbar, content     │
│          │ Tab bar       │                              │
└──────────┴───────────────┴─────────────────────────────┘
```

The middle column shows the library tree in list view, and the item's tab bar in editor view. The nav sidebar and header stay the same everywhere.

## Component patterns

- **NavItem:** icon plus label, active state `bg-zinc-800` with orange icon
- **Header:** orange icon square (`bg-orange-500`, `rounded-lg`), title, refresh button on the right (green outline)
- **Primary button:** `bg-green-600 hover:bg-green-500`, white text
- **Icon action:** 7x7 square, green for edit, red for delete
- **Input:** `bg-zinc-900 border-zinc-800`, focus `border-zinc-700`, placeholder `text-zinc-600`
- **Table:** sortable header row with `ArrowUpDown`, active sort arrow orange, row hover `bg-zinc-900/50`
- **Tab (editor):** active tab with orange left border plus `bg-zinc-800/60`, like the active tree node

## Icons

Always `lucide-react`. Consistent sizes: 16 in the nav, 14 to 15 in the tree, 13 in action buttons.

## Typography

`font-sans`, default system stack. Sizes: `text-lg` header, `text-sm` content, `text-[11px]` nav section labels in uppercase.
