# Add Button & Action Menu Documentation

## Overview

The Add button is a custom tab in the native tab bar that opens an action menu modal. The modal appears as an overlay on the current screen, giving users quick access to common actions like adding transactions, subscriptions, budgets, and asking the AI advisor.

## Architecture

### Key Components

1. **ActionMenu Component** (`src/components/ActionMenu.tsx`)
   - The modal popup that displays action options
   - Supports both Modal and overlay rendering modes
   - Includes smooth animations (slide up, fade, staggered items)

2. **ActionMenuContext** (`src/contexts/ActionMenuContext.tsx`)
   - Global state management for the action menu
   - Tracks previous routes for navigation
   - Handles menu visibility and navigation logic

3. **Add Screen** (`app/(tabs)/add/index.tsx`)
   - The screen that renders when the Add tab is pressed
   - Renders the previous screen's content behind the modal
   - Manages local menu state for overlay rendering

4. **Tab Layouts** (`app/(tabs)/_layout.native.tsx`, `_layout.tsx`, etc.)
   - Defines the Add tab button in the native tab bar
   - Uses native tabs for iOS liquid glass styling

## How It Works

### 1. User Flow

```
User on Finance Screen
    ↓
Clicks Add Tab
    ↓
Navigates to /(tabs)/add route
    ↓
Add screen renders Finance screen content + shows modal overlay
    ↓
User sees modal on top of Finance screen (seamless experience)
    ↓
User clicks option or outside
    ↓
Modal closes → Navigates back to Finance screen
```

### 2. Route Tracking

The system tracks the previous route before navigating to the add screen:

- **Before navigation**: Current route (e.g., `/(tabs)/finance`) is stored in `previousRouteRef`
- **During add screen**: Previous screen content is rendered behind the modal
- **After closing**: Navigation returns to the stored previous route

### 3. Modal Rendering Modes

The ActionMenu component supports two rendering modes:

#### Modal Mode (Default)
- Used when menu is triggered from other screens
- Uses React Native's `Modal` component
- Blocks all touches except tab bar area

#### Overlay Mode (`renderAsOverlay={true}`)
- Used when on the add screen
- Renders as absolute positioned overlay
- Doesn't block native tab bar touches
- Allows tab navigation while modal is open

### 4. Animation System

The modal uses multiple animations for a polished experience:

- **Slide Animation**: Menu slides up from bottom (300px → 0) with spring physics
- **Fade Animation**: Overlay fades in/out (0 → 1 opacity)
- **Stagger Animation**: Menu items appear sequentially with 30ms delays
- **Scale Animation**: Items scale from 0.9 to 1.0 as they appear

### 5. Tab Bar Interaction

The modal is designed to not block the native tab bar:

- **Overlay mode**: Uses `pointerEvents="none"` on tab bar area
- **Modal mode**: Excludes bottom ~80px from touch handling
- **Route detection**: Automatically closes modal when user switches tabs

## File Structure

```
app/(tabs)/
  ├── _layout.native.tsx      # Native tabs layout (iOS/Android)
  ├── _layout.tsx              # Default tabs layout
  ├── _layout.web.tsx          # Web tabs layout
  ├── _layout.android.tsx      # Android tabs layout
  └── add/
      ├── _layout.tsx          # Add screen layout (no animations)
      └── index.tsx            # Add screen component

src/
  ├── components/
  │   └── ActionMenu.tsx       # Modal/overlay component
  └── contexts/
      └── ActionMenuContext.tsx # Global state management
```

## Key Features

### ✅ Seamless User Experience
- Modal appears on current screen (no white screen)
- Previous screen content visible behind modal
- Smooth animations distract from navigation

### ✅ Native Tab Bar Integration
- Uses native tabs for iOS liquid glass styling
- Tab bar remains clickable when modal is open
- Automatic modal close on tab switch

### ✅ Smart Navigation
- Tracks previous route automatically
- Returns to exact previous screen (not always home)
- No duplicate screens or navigation issues

### ✅ Smooth Animations
- Spring-based slide up animation
- Staggered item appearance
- Fade in/out transitions

## Implementation Details

### Route Tracking

```typescript
// In ActionMenuContext.tsx
useEffect(() => {
  // Store route before navigating to add
  if (pathname && !pathname.includes('/add')) {
    previousRouteRef.current = pathname;
  }
}, [pathname]);
```

### Modal Rendering

```typescript
// In add/index.tsx
<ActionMenu 
  visible={menuVisible} 
  onClose={handleCloseMenu} 
  renderAsOverlay={true}  // Renders as overlay, not Modal
/>
```

### Previous Screen Rendering

```typescript
// In add/index.tsx
const previousRoute = getPreviousRoute() || '/(tabs)';

if (previousRoute.includes('/finance')) {
  setPreviousScreen(<FinanceHomeScreen />);
} else if (previousRoute.includes('/ai')) {
  setPreviousScreen(<AIScreen />);
} else {
  setPreviousScreen(<HomeScreen />);
}
```

## Customization

### Adding New Menu Items

Edit `src/components/ActionMenu.tsx`:

```typescript
const menuItems: ActionMenuItem[] = [
  {
    label: 'Your New Action',
    icon: 'your-icon-name',
    route: '/(tabs)/your-route',
    description: 'Optional description',
  },
  // ... existing items
];
```

### Changing Animations

Edit animation parameters in `ActionMenu.tsx`:

```typescript
Animated.spring(slideAnim, {
  toValue: 0,
  useNativeDriver: true,
  tension: 65,    // Adjust for spring stiffness
  friction: 8,    // Adjust for damping
});
```

### Modifying Tab Bar Appearance

Edit `app/(tabs)/_layout.native.tsx`:

```typescript
<NativeTabs.Trigger name="add">
  <Icon 
    sf={{ default: 'your-icon', selected: 'your-icon.fill' }} 
    drawable="your_drawable"
  />
  <Label>Your Label</Label>
</NativeTabs.Trigger>
```

## Troubleshooting

### Modal Not Appearing
- Check that `menuVisible` state is being set to `true`
- Verify ActionMenuContext is wrapping the app in `app/_layout.tsx`
- Ensure route includes `/add` when on add screen

### Tab Bar Not Clickable
- Verify `renderAsOverlay={true}` is set when on add screen
- Check that tab bar area has `pointerEvents="none"`
- Ensure overlay doesn't cover bottom 80px

### Navigation Issues
- Verify `previousRouteRef` is being set before navigating to add
- Check that route tracking excludes `/add` route
- Ensure `router.replace()` uses correct route format

### Flickering
- Check that `animation: 'none'` is set in add screen layout
- Verify previous screen renders immediately
- Ensure modal shows in same frame as navigation

## Technical Notes

### Why Overlay Instead of Modal?

When rendering as a Modal, React Native's Modal component can block touches to the native tab bar. By rendering as an overlay directly in the search screen, we:
- Don't block native tab bar touches
- Maintain native tab bar styling (liquid glass)
- Allow seamless tab switching

### Route Name: "add" vs "search"

The route was renamed from "search" to "add" to better reflect its purpose. All references have been updated:
- Folder: `app/(tabs)/add/`
- Route: `/(tabs)/add`
- Tab trigger: `name="add"`

### Animation Performance

All animations use `useNativeDriver: true` for 60fps performance:
- Transform animations (translateY, scale) run on native thread
- Opacity animations run on native thread
- No layout recalculations during animation

## Future Enhancements

Potential improvements:
- [ ] Add haptic feedback on menu open
- [ ] Support for custom menu item ordering
- [ ] Keyboard shortcuts for menu items
- [ ] Recent actions quick access
- [ ] Menu item search/filter



