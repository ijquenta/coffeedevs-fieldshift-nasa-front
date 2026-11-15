type PlantingMode = "date" | "range" | "flexible";

export function plantingWindow(mode: PlantingMode, from: string, to: string, flexibleWeeks: number) {
  if (mode !== "flexible") return { desde: from, hasta: mode === "date" ? from : to };
  const [year, month, day] = from.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day);
  start.setDate(start.getDate() - flexibleWeeks * 7);
  end.setDate(end.getDate() + flexibleWeeks * 7);
  const format = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  return { desde: format(start), hasta: format(end) };
}
