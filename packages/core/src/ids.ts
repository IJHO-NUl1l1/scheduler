import { randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 소문자 영숫자 6자 ID. existing에 없는 값을 돌려주고 existing에 추가한다 */
export function generateId(existing: Set<string>): string {
  for (;;) {
    let id = '';
    for (let i = 0; i < 6; i++) id += ALPHABET[randomInt(ALPHABET.length)];
    if (!existing.has(id)) {
      existing.add(id);
      return id;
    }
  }
}
