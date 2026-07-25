type Labels = Readonly<Record<string, string | number | boolean>>;

const labelKey = (labels: Labels): string =>
  Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}="${String(value).replaceAll('"', '\\"')}"`)
    .join(',');

export class MetricsRegistry {
  readonly #counters = new Map<string, number>();
  readonly #gauges = new Map<string, number>();

  public increment(name: string, labels: Labels = {}, value = 1): void {
    const key = `${name}{${labelKey(labels)}}`;
    this.#counters.set(key, (this.#counters.get(key) ?? 0) + value);
  }

  public set(name: string, value: number, labels: Labels = {}): void {
    this.#gauges.set(`${name}{${labelKey(labels)}}`, value);
  }

  public render(): string {
    return [...this.#counters, ...this.#gauges]
      .map(([key, value]) => `${key} ${value}`)
      .join('\n')
      .concat('\n');
  }
}
