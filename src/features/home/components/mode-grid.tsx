import type { Href } from 'expo-router';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useUniwind } from 'uniwind';
import { Text } from '@/components/ui';
import { translate } from '@/lib/i18n';

type ModeCardProps = {
  icon: any;
  label: string;
  route: Href;
  width: number;
};

function ModeCard({ icon, label, route, width }: ModeCardProps) {
  const router = useRouter();
  const { theme } = useUniwind();
  const isDark = theme === 'dark';

  return (
    <Pressable
      onPress={() => router.push(route)}
      style={{ width }}
      className="min-h-[148px] justify-between rounded-[17px] border-[0.57px] border-neutral-200 bg-neutral-50 p-4 active:opacity-70 dark:border-[#48484880] dark:bg-[#111213]"
    >
      <View className="size-[42px] items-center justify-center rounded-lg bg-neutral-200/50 dark:bg-transparent">
        <Image
          source={icon}
          style={{ width: 26, height: 26 }}
          contentFit="contain"
          tintColor={isDark ? undefined : '#262626'}
        />
      </View>
      <Text
        className="mt-3 text-[17px] leading-tight font-normal text-black/80 dark:text-white/80"
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const landscapeIcon = require('@/assets/icons/index/LandScapemode.png');
const albumIcon = require('@/assets/icons/index/PhotoAlbum.png');
const planetIcon = require('@/assets/icons/index/PlanetVideo.png');
const starryIcon = require('@/assets/icons/index/StarrySkyMode.png');

export function ModeGrid() {
  const { width } = useWindowDimensions();
  // Calculate card width: (screen width - horizontal margin - gap) / 2
  // mx-5 = 20px each side = 40px total, gap-3 = 12px
  const cardWidth = (width - 40 - 12) / 2;

  return (
    <>
      <View className="mx-5 mb-3">
        <Text className="text-[20px] font-bold text-black dark:text-white">
          {translate('home.shooting_modes')}
        </Text>
      </View>

      <View className="mx-5 flex-row flex-wrap justify-between gap-3">
        <ModeCard
          icon={landscapeIcon}
          label={translate('home.mode_landscape')}
          route={{ pathname: '/camera', params: { mode: 'landscape' } }}
          width={cardWidth}
        />
        <ModeCard
          icon={starryIcon}
          label={translate('home.mode_starry')}
          route={{ pathname: '/camera', params: { mode: 'nebula' } }}
          width={cardWidth}
        />
        <ModeCard
          icon={planetIcon}
          label={translate('home.mode_planet')}
          route={{ pathname: '/camera', params: { mode: 'planet' } }}
          width={cardWidth}
        />
        <ModeCard
          icon={albumIcon}
          label={translate('home.mode_album')}
          route="/album"
          width={cardWidth}
        />
      </View>
    </>
  );
}
