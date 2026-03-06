interface EmptySlotProps {
  message: string;
}

export function EmptySlot({ message }: EmptySlotProps) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
