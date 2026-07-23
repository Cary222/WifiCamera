<p align="center">
    <img alt="SkySense" src="https://github.com/skysense/skysense/assets/11137944/a8163d23-897a-4efe-91ce-b9bf7348c18f" width="200" />
</p>

<h1 align="center">
  SkySense
</h1>

![expo](https://img.shields.io/github/package-json/dependency-version/skysense/skysense-app/expo?label=expo) ![react-native](https://img.shields.io/github/package-json/dependency-version/skysense/skysense-app/react-native?label=react-native) ![GitHub Repo stars](https://img.shields.io/github/stars/skysense/skysense) ![GitHub commit activity (branch)](https://img.shields.io/github/commit-activity/m/skysense/skysense-app/main)

SkySense is a mobile application for monitoring sky brightness and light pollution. It connects to ESP8266-based SQM (Sky Quality Meter) devices to provide real-time measurements of night sky quality, temperature, humidity, pressure, and battery status.

## About SkySense

SkySense helps astronomers, light pollution researchers, and citizen scientists track and analyze sky quality over time. The app connects to hardware devices deployed outdoors to continuously monitor changes in light pollution levels.

## Key Features

- **Real-time SQM Monitoring**: Live sky brightness measurements displayed in mag/arcsec²
- **Multi-Sensor Dashboard**: Temperature, humidity, pressure, battery, and WiFi signal strength
- **Device Management**: Add, view, and manage multiple ESP8266 devices
- **Historical Data & Charts**: Analyze sky quality trends over hours, days, and weeks
- **Dark Mode**: Optimized for nighttime observation use
- **Offline Support**: Local data caching when network is unavailable

## Technology Stack

- **Expo SDK 54** with React Native 0.81.5
- **TypeScript** for type safety
- **Expo Router 6** for file-based routing
- **NativeWind / TailwindCSS** for styling
- **Zustand** for state management
- **React Query** for data fetching
- **TanStack Form + Zod** for form handling
- **MMKV** for encrypted local storage
- **react-native-gifted-charts** for data visualization
- **Jest + React Testing Library** for testing

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+
- Expo CLI
- For physical device testing: Expo Go or a custom dev client

### Installation

```bash
# Clone the repository
git clone https://github.com/skysense/skysense.git
cd skysense-app

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

# EAS Cloud Build (for urgent delivery)
eas build --platform android --profile production
```

## Project Structure

```
src/
├── app/                  # Expo Router routes
├── features/
│   ├── skysense/         # Core monitoring dashboard
│   ├── device/           # Device management
│   ├── history/          # Historical data & charts
│   ├── settings/         # App settings
│   └── auth/             # User authentication
├── components/ui/        # Base UI components
├── lib/                  # Utilities (API, storage, i18n)
├── services/             # API clients & WebSocket
└── translations/         # i18n language files
```

## Backend & Data Sync

- **Phase 1**: App works with local mock data (no backend required)
- **Phase 2**: HTTP API communication with ESP8266 devices
- **Phase 3**: WebSocket for real-time data streaming
- **Future**: Supabase or custom Node.js backend for data persistence and user accounts

## Development Commands

```bash
pnpm start           # Start dev server
pnpm android         # Run on Android
pnpm ios             # Run on iOS
pnpm lint            # ESLint check
pnpm type-check      # TypeScript validation
pnpm test            # Run tests
pnpm check-all       # All quality checks
pnpm build:preview:android   # EAS preview build
pnpm build:production:android # EAS production build
```

## Contributing

Contributions are welcome. Please open an issue or submit a pull request.

## License

MIT
# WifiCamera
