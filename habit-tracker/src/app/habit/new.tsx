import { router } from 'expo-router';
import { HabitForm, EMPTY_HABIT } from '@/components/HabitForm';
import { Screen, ScreenHeader } from '@/components/ui';
import { useHabitStore } from '@/store/habitStore';

export default function NewHabit() {
  const addHabit = useHabitStore((s) => s.addHabit);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Screen maxWidth={720}>
      <ScreenHeader title="New habit" onBack={close} />
      <HabitForm
        initial={EMPTY_HABIT}
        submitLabel="Create habit"
        onCancel={close}
        onSubmit={(input) => {
          addHabit(input);
          close();
        }}
      />
    </Screen>
  );
}
