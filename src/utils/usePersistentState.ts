/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dispatch, SetStateAction, useEffect, useState } from 'react';

// ТЗ 4.1 / наряд: перехід між сторінками не скидає фільтри, сортування і сторінку пагінації інших сторінок.
// Стан зберігається в пам'яті прототипу до перезавантаження сторінки.
const store = new Map<string, unknown>();

export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial));
  useEffect(() => {
    store.set(key, value);
  }, [key, value]);
  return [value, setValue];
}
