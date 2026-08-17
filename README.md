# WifiCamera

<p align="center">
    <img alt="WifiCamera" src="https://github.com/wificamera/wificamera/assets/11137944/a8163d23-897a-4efe-91ce-b9bf7348c18f" width="200" />
</p>

<p align="center">
    A mobile application for wireless astronomy cameras. Connect to your camera over WiFi and capture in multiple modes — landscape, planet video, starry sky, and deep space.
</p>

<p align="center">

![expo](https://img.shields.io/github/package-json/dependency-version/wificamera/wificamera-app/expo?label=expo)
![react-native](https://img.shields.io/github/package-json/dependency-version/wificamera/wificamera-app/react-native?label=react-native)
![GitHub Repo stars](https://img.shields.io/github/stars/wificamera/wificamera)
![GitHub commit activity (branch)](https://img.shields.io/github/commit-activity/m/wificamera/wificamera-app/main)

</p>

---

## About

WifiCamera turns your Android or iOS device into a remote control for your WiFi astronomy camera. Once connected to the same network as the camera, you can preview the live feed, adjust exposure settings, switch between shooting modes, browse captured photos on the camera's storage card, and push firmware updates — all from your phone.

## Key Features

- **Device Discovery & Connection**: Auto-scan the local network for compatible cameras; connect with one tap
- **Live Preview**: WebRTC-based real-time video feed from the camera
- **Multi-Mode Shooting**
  - **Landscape**: Timed bursts, countdown, EV/gain/white-balance controls
  - **Planet Video**: Short video capture optimized for planetary imaging
  - **Starry Sky**: Long-exposure deep-sky capture with gain/exposure presets
  - **Deep Space**: Stellarium integration for plate-solving and star-map overlay
- **Photo Gallery**: Browse, view, and manage folders on the camera's TF card
- **Firmware Update (OTA)**: Push firmware packages directly to the device over the local network
- **Dark Mode**: Full dark theme tuned for nighttime field use

## Technology Stack

- **Expo SDK 54** with React Native 0.81.5
- **TypeScript** throughout
- **Expo Router 6** for file-based routing
- **NativeWind / TailwindCSS** for styling
- **Zustand + MMKV** for state and encrypted local storage
- **React Query** for server-state management
- **TanStack Form + Zod** for form handling
- **WebRTC** (`react-native-webrtc`) for live camera preview
- **WebSocket** for device command/control channel
- **Stellarium WebView** for deep-space star maps
- **react-native-gifted-charts** for data visualization
- **Jest + React Testing Library** for unit testing

## Prerequisites

- Node.js 18+
- pnpm 9+
- Expo CLI (`npx expo-cli`)
- For physical device testing: Expo Go (development) or a custom dev client (production)

## Getting Started

```bash
# Clone the repository
git clone https://github.com/wificamera/wificamera.git
cd wificamera-app

# Install dependencies
pnpm install

# Start development server
pnpm start
```

### Running on Devices

```bash
# Android
pnpm android

# iOS
pnpm ios
```

### Building for Production

```bash
# Local Android build (requires android/ directory from prebuild)
cd android && ./gradlew assembleProdRelease

# EAS Cloud Build
eas build --platform android --profile production
```

## Project Structure

```
src/
├── app/                      # Expo Router routes (file-based routing)
├── features/
│   ├── home/                 # Home screen & camera modes
│   │   ├── camera/           # Camera capture, preview, WebSocket control
│   │   │   ├── landscape/    # Landscape / timed-burst mode
│   │   │   ├── planet/       # Planet video mode
│   │   │   ├── nebula/       # Deep-space capture & plate-solving
│   │   │   ├── services/     # HTTP client, WebSocket, WHEP, OTA, file services
│   │   │   └── components/   # Shared camera UI components
│   │   └── album/            # Camera storage browser
│   ├── deep-space/           # Deep-space mode screen & navigation
│   ├── stellarium/           # Stellarium WebView integration
│   ├── settings/             # App settings, OTA, language, theme
│   ├── onboarding/           # First-launch onboarding
│   └── auth/                 # User authentication
├── components/ui/            # Base UI components (Button, Text, Modal…)
├── lib/                      # Utilities (API client, storage, i18n, env)
├── translations/             # i18n language files (en, zh, ar)
└── assets/
    └── stellar/              # Stellarium sky-culture data
```

## Development Commands

```bash
pnpm start                     # Start dev server
pnpm android                  # Run on Android
pnpm ios                      # Run on iOS
pnpm lint                     # ESLint check
pnpm type-check               # TypeScript validation
pnpm test                     # Run tests
pnpm check-all                # All quality checks
pnpm lint:translations        # Validate i18n JSON files
pnpm build:preview:android    # EAS preview build (Android)
pnpm build:production:android # EAS production build (Android)
pnpm build:preview:ios        # EAS preview build (iOS)
pnpm build:production:ios     # EAS production build (iOS)
```

## Contributing

Contributions are welcome. Please open an issue or submit a pull request.

## License

MIT
