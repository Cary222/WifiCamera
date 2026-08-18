import type { Href } from 'expo-router';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';
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

  return (
    <Pressable
      onPress={() => router.push(route)}
      style={{ width }}
      className="h-[139px] rounded-[17.069px] border-[0.569px] border-neutral-200 bg-neutral-50 p-5 active:opacity-70 dark:border-[#48484880] dark:bg-[#111213]"
    >
      <View className="size-[45px] items-center justify-center rounded-lg bg-transparent">
        <Image
          source={icon}
          style={{ width: 28, height: 28 }}
          contentFit="contain"
        />
      </View>
      <Text className="mt-6 text-[20px] font-normal text-black/80 dark:text-white/80">
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
