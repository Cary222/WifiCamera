import { Text } from '@/components/ui';

export type SectionHeaderProps = {
  title: string;
};

export function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <Text className="text-base text-white">{title}</Text>
  );
}
