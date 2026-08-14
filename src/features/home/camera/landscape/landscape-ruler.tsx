/* eslint-disable max-lines-per-function */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui';

const BRAND = '#CBFF3C';
const TICK_SPACING = 20;
const RULER_HEIGHT = 58;

function closestIndex(values: number[], value: number): number {
  let nearest = 0;
  values.forEach((candidate, index) => {
    if (Math.abs(candidate - value) < Math.abs(values[nearest] - value)) {
      nearest = index;
    }
  });
  return nearest;
}

type LandscapeRulerProps = {
  label: string;
  values: number[];
  value: number;
  formatValue: (value: number) => string;
  formatTick?: (value: number, index: number) => string | null;
  onChange: (value: number) => void;
};

/**
 * Scroll-snapped camera ruler. Drag values stay local while the finger is down,
 * preventing every 16ms scroll event from forcing the entire camera screen to
 * re-render; the store receives the value immediately but the ruler does not
 * wait for that state round-trip before rendering the next tick.
 */
export function LandscapeRuler({
  label,
  values,
  value,
  formatValue,
  formatTick,
  onChange,
}: LandscapeRulerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [rulerWidth, setRulerWidth] = useState(0);
  const isDraggingRef = useRef(false);
  const currentIndexRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [draggedValue, setDraggedValue] = useState<number | null>(null);

  const displayedValue = draggedValue ?? value;
  const selectedIndex = useMemo(() => closestIndex(values, value), [values, value]);
  const sidePadding = Math.max(0, (rulerWidth - TICK_SPACING) / 2);

  const scrollToIndex = useCallback((index: number, animated: boolean) => {
    if (rulerWidth)
      scrollRef.current?.scrollTo({ x: index * TICK_SPACING, animated });
  }, [rulerWidth]);

  useEffect(() => {
    if (!isDraggingRef.current) {
      scrollToIndex(selectedIndex, false);
      currentIndexRef.current = selectedIndex;
    }
  }, [selectedIndex, scrollToIndex]);

  const updateFromScroll = useCallback((event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offset = event.nativeEvent.contentOffset.x;
    const index = Math.max(0, Math.min(values.length - 1, Math.round(offset / TICK_SPACING)));
    if (currentIndexRef.current === index)
      return;
    currentIndexRef.current = index;
    const next = values[index];
    if (next === undefined)
      return;
    setDraggedValue(next);
    onChangeRef.current(next);
  }, [values]);

  const onScrollBeginDrag = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const finishDrag = useCallback((event: { nativeEvent: { contentOffset: { x: number } } }) => {
    isDraggingRef.current = false;
    updateFromScroll(event);
    setDraggedValue(null);
    const offset = event.nativeEvent.contentOffset.x;
    const index = Math.max(0, Math.min(values.length - 1, Math.round(offset / TICK_SPACING)));
    scrollToIndex(index, true);
  }, [scrollToIndex, updateFromScroll, values.length]);

  return (
    <View className="w-full">
      <Text className="text-center text-[19px] text-white">{formatValue(displayedValue)}</Text>
      <View className="mt-2 flex-row items-center">
        {label ? <Text className="w-[86px] text-[14px] text-white">{label}</Text> : null}
        <View
          className="flex-1"
          style={{ height: RULER_HEIGHT }}
          onLayout={(event) => {
            const nextWidth = event.nativeEvent.layout.width;
            if (nextWidth !== rulerWidth)
              setRulerWidth(nextWidth);
          }}
        >
          {rulerWidth > 0 && (
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              scrollEventThrottle={16}
              snapToInterval={TICK_SPACING}
              snapToAlignment="start"
              onScrollBeginDrag={onScrollBeginDrag}
              onScroll={updateFromScroll}
              onMomentumScrollEnd={finishDrag}
              onScrollEndDrag={(event) => {
                if (event.nativeEvent.velocity?.x === 0)
                  finishDrag(event);
              }}
              contentContainerStyle={{ paddingHorizontal: sidePadding }}
            >
              {values.map((item, index) => {
                const major = index % 5 === 0;
                const tickLabel = formatTick?.(item, index) ?? null;
                return (
                  <Pressable
                    key={`${item}-${index}`}
                    onPress={() => {
                      onChange(item);
                      scrollToIndex(index, true);
                    }}
                    style={{ width: TICK_SPACING, height: RULER_HEIGHT }}
                    className="items-center justify-end"
                  >
                    {tickLabel
                      ? <Text numberOfLines={1} style={{ width: 68 }} className="mb-1.5 text-center text-[10px] text-white/45">{tickLabel}</Text>
                      : <View className="mb-1.5 h-[15px]" />}
                    <View style={{ width: 1.5, height: major ? 22 : 14, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.34)' }} />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <View className="pointer-events-none absolute inset-0 items-center justify-end">
            <View style={{ width: 3, height: 34, borderRadius: 2, backgroundColor: BRAND }} />
          </View>
        </View>
      </View>
    </View>
  );
}
