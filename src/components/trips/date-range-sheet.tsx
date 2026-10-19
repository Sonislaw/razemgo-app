import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  Button,
  IconButton,
  layout,
} from '@/components/ui/primitives';
import { MaxContentWidth, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateLabel } from '@/features/trips/trip-date-field';
import { isValidDate, todayDate } from '@/features/trips/own-trips-state';
import type { DateRange } from '@/types/travel';
import {
  formatTripDates,
  getDiscoveryDateRangeError,
} from '@/features/discovery/filter-trips';
import {
  calendarMonthCells,
  DATE_TOLERANCES,
  dateToleranceLabel,
  EMPTY_CALENDAR_RANGE,
  rangeDurationLabel,
  selectCalendarDate,
  shiftCalendarMonth,
} from '@/features/trips/date-range-calendar';

export function DateRangeSheet({
  initialRange,
  initialTolerance = 0,
  allowTolerance = false,
  onApply,
  onClose,
}: {
  initialRange?: DateRange;
  initialTolerance?: number;
  allowTolerance?: boolean;
  onApply: (range: DateRange, tolerance: number) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const today = todayDate();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const list = useRef<FlatList<string>>(null);
  const [range, setRange] = useState<DateRange>(() => ({
    ...(initialRange ?? EMPTY_CALENDAR_RANGE),
  }));
  const [tolerance, setTolerance] = useState(
    allowTolerance ? initialTolerance : 0,
  );
  const [firstMonth, setFirstMonth] = useState(() =>
    (isValidDate(initialRange?.startDate ?? '')
      ? initialRange!.startDate
      : todayDate()
    ).slice(0, 7),
  );
  const [monthCount, setMonthCount] = useState(() => {
    if (!isValidDate(initialRange?.endDate ?? '')) return 24;
    const end = initialRange!.endDate;
    return Math.max(
      24,
      (Number(end.slice(0, 4)) - Number(firstMonth.slice(0, 4))) * 12 +
        Number(end.slice(5, 7)) -
        Number(firstMonth.slice(5, 7)) +
        2,
    );
  });
  const months = useMemo(
    () =>
      Array.from({ length: monthCount }, (_, index) =>
        shiftCalendarMonth(firstMonth, index),
      ),
    [firstMonth, monthCount],
  );
  const dayHeight = Math.max(48, Math.ceil(20 * fontScale + 16));
  const monthHeaderHeight = Math.max(48, Math.ceil(28 * fontScale + 16));
  const monthLayouts = useMemo(() => {
    let offset = 0;
    return months.map((month, index) => {
      const length =
        monthHeaderHeight +
        (calendarMonthCells(month).length / 7) * dayHeight +
        16;
      const result = { length, offset, index };
      offset += length;
      return result;
    });
  }, [months, dayHeight, monthHeaderHeight]);
  const complete = Boolean(
    range.startDate && range.endDate && !getDiscoveryDateRangeError(range),
  );
  const monthLabel = (month: string) =>
    new Intl.DateTimeFormat('pl-PL', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(month + '-01T00:00:00Z'));

  return (
    <Modal
      transparent
      visible
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zamknij kalendarz bez zmian"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        />
        <View
          role="dialog"
          accessibilityLabel="Wybierz daty"
          accessibilityViewIsModal
          aria-modal
          style={[
            styles.sheet,
            {
              backgroundColor: theme.backgroundElement,
              marginTop: insets.top,
              paddingBottom: Math.max(12, insets.bottom),
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.flex}>
              <AppText variant="heading" accessibilityRole="header">
                Wybierz daty
              </AppText>
              <AppText
                variant="caption"
                color="textSecondary"
                accessibilityLiveRegion="polite"
              >
                {range.startDate && !range.endDate
                  ? 'Teraz wybierz dzień powrotu'
                  : 'Zaznacz dzień wyjazdu i powrotu'}
              </AppText>
            </View>
            <IconButton
              label="Zamknij wybór dat bez zmian"
              icon="close"
              onPress={onClose}
            />
          </View>
          <View style={[styles.weekdays, { borderBottomColor: theme.border }]}>
            {['pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'niedz.'].map(
              (day) => (
                <AppText
                  key={day}
                  variant="caption"
                  color="textSecondary"
                  style={styles.weekday}
                >
                  {day}
                </AppText>
              ),
            )}
          </View>
          <FlatList
            accessibilityLabel="Kalendarz wyjazdu"
            ref={list}
            data={months}
            keyExtractor={(month) => month}
            style={styles.calendar}
            contentContainerStyle={styles.calendarContent}
            initialNumToRender={2}
            windowSize={5}
            maxToRenderPerBatch={3}
            extraData={range}
            getItemLayout={(_, index) => monthLayouts[index]}
            onEndReached={() => setMonthCount((count) => count + 12)}
            onEndReachedThreshold={0.3}
            renderItem={({ item: month, index }) => (
              <View style={{ paddingBottom: 16 }}>
                <View style={[layout.row, { minHeight: monthHeaderHeight }]}>
                  <AppText
                    variant="heading"
                    accessibilityRole="header"
                    style={styles.flex}
                  >
                    {monthLabel(month)}
                  </AppText>
                  {index === 0 ? (
                    <IconButton
                      label="Poprzedni miesiąc"
                      icon="back"
                      onPress={() => {
                        setFirstMonth((current) =>
                          shiftCalendarMonth(current, -1),
                        );
                        setMonthCount((count) => count + 1);
                        list.current?.scrollToOffset({
                          offset: 0,
                          animated: false,
                        });
                      }}
                    />
                  ) : null}
                </View>
                <View style={styles.days}>
                  {calendarMonthCells(month).map((date, cell) => {
                    if (!date)
                      return (
                        <View
                          key={cell}
                          style={{ width: '14.285714%', height: dayHeight }}
                        />
                      );
                    const start = date === range.startDate;
                    const end = date === range.endDate;
                    const inside = Boolean(
                      range.startDate &&
                      range.endDate &&
                      date > range.startDate &&
                      date < range.endDate,
                    );
                    const selected = start || end;
                    const isToday = date === today;
                    return (
                      <Pressable
                        key={date}
                        accessibilityRole="button"
                        accessibilityLabel={
                          dateLabel(date) +
                          (isToday ? ', dzisiaj' : '') +
                          (start
                            ? ', początek wyjazdu'
                            : end
                              ? ', koniec wyjazdu'
                              : inside
                                ? ', w wybranym zakresie'
                                : '')
                        }
                        accessibilityState={{ selected: selected || inside }}
                        aria-selected={selected || inside}
                        onPress={() =>
                          setRange((current) =>
                            selectCalendarDate(current, date),
                          )
                        }
                        style={({ pressed }) => [
                          styles.day,
                          {
                            height: dayHeight,
                            backgroundColor: selected
                              ? theme.primaryStrong
                              : inside
                                ? theme.muted
                                : 'transparent',
                            borderTopLeftRadius: start ? 12 : 0,
                            borderBottomLeftRadius: start ? 12 : 0,
                            borderTopRightRadius:
                              end || (start && !range.endDate) ? 12 : 0,
                            borderBottomRightRadius:
                              end || (start && !range.endDate) ? 12 : 0,
                            opacity: pressed ? 0.65 : 1,
                          },
                        ]}
                      >
                        {isToday ? (
                          <View
                            pointerEvents="none"
                            style={[
                              styles.todayOutline,
                              {
                                borderColor: selected
                                  ? theme.onPrimary
                                  : theme.primaryStrong,
                              },
                            ]}
                          />
                        ) : null}
                        <AppText
                          variant="label"
                          style={{
                            color: selected
                              ? theme.onPrimary
                              : isToday
                                ? theme.primaryStrong
                                : theme.text,
                            fontWeight: isToday ? '700' : '600',
                          }}
                        >
                          {Number(date.slice(8, 10))}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          />
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            {allowTolerance ? (
              <>
                <ScrollView
                  horizontal
                  style={{ flexGrow: 0 }}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tolerances}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Elastyczność wyszukiwania"
                >
                  {DATE_TOLERANCES.map((days) => (
                    <Pressable
                      key={days}
                      accessibilityRole="radio"
                      accessibilityLabel={dateToleranceLabel(days)}
                      accessibilityState={{ checked: tolerance === days }}
                      aria-checked={tolerance === days}
                      onPress={() => setTolerance(days)}
                      style={[
                        styles.tolerance,
                        {
                          borderColor:
                            tolerance === days
                              ? theme.primaryStrong
                              : theme.border,
                          backgroundColor:
                            tolerance === days
                              ? theme.muted
                              : theme.backgroundElement,
                        },
                      ]}
                    >
                      <AppText
                        variant="label"
                        color={tolerance === days ? 'primaryStrong' : 'text'}
                      >
                        {dateToleranceLabel(days)}
                      </AppText>
                    </Pressable>
                  ))}
                </ScrollView>
                <AppText
                  variant="caption"
                  color="textSecondary"
                  style={styles.center}
                >
                  {tolerance
                    ? 'Możemy przesunąć cały wyjazd, zachowując jego długość.'
                    : 'Szukamy wyjazdów pokrywających się z wybranym terminem.'}
                </AppText>
              </>
            ) : null}
            <AppText
              variant="label"
              accessibilityLiveRegion="polite"
              style={styles.center}
            >
              {complete
                ? formatTripDates(range) + ' · ' + rangeDurationLabel(range)
                : range.startDate
                  ? dateLabel(range.startDate) + ' → wybierz powrót'
                  : 'Wybierz początek i koniec wyjazdu'}
            </AppText>
            <Button
              label="Wybierz daty"
              disabled={!complete}
              onPress={() => {
                if (complete) onApply(range, allowTolerance ? tolerance : 0);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    height: '94%',
    borderTopLeftRadius: Radius.hero,
    borderTopRightRadius: Radius.hero,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  flex: { flex: 1 },
  weekdays: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  weekday: { width: '14.285714%', textAlign: 'center' },
  calendar: { flex: 1, minHeight: 0 },
  calendarContent: { paddingHorizontal: 16 },
  days: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.285714%', alignItems: 'center', justifyContent: 'center' },
  todayOutline: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    right: 4,
    borderWidth: 2,
    borderRadius: 8,
  },
  footer: { paddingTop: 12, paddingHorizontal: 16, gap: 12, borderTopWidth: 1 },
  tolerances: { gap: 8 },
  tolerance: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: Radius.pill,
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});
