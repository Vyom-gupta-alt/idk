import { router, useLocalSearchParams } from 'expo-router';
import { HabitForm } from '@/components/HabitForm';
import { EmptyState, Screen, ScreenHeader } from '@/components/ui';
import { useHabitStore } from '@/store/habitStore';

export default function EditHabit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const habit = useHabitStore((s) => s.habits.find((h) => h.id === id));
  const updateHabit = useHabitStore((s) => s.updateHabit);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!habit) {
    return (
      <Screen>
        <ScreenHeader title="Edit habit" onBack={close} />
        <EmptyState icon="help-circle-outline" title="Habit not found" body="It may have been deleted." />
      </Screen>
    );
  }

  const { name, description, icon, color, frequency, subtasks, reminder } = habit;
  return (
    <Screen maxWidth={720}>
      <ScreenHeader title="Edit habit" onBack={close} />
      <HabitForm
        initial={{ name, description, icon, color, frequency, subtasks, reminder }}
        submitLabel="Save changes"
        onCancel={close}
        onSubmit={(input) => {
          updateHabit(habit.id, input);
          close();
        }}
      />
    </Screen>
  );
}
