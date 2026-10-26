import { checkContent } from '../logic/content.ts';
import cafe from '../content/cafe.json';
import staff from '../content/staff.json';
import upgrades from '../content/upgrades.json';
import decor from '../content/decor.json';
import tasks from '../content/tasks.json';
import { checkDecor } from '../logic/decor.ts';

/** All game content, checked once at startup (a typo in the JSON fails loudly). */
export const content = checkContent({ cafe, staff, upgrades, tasks });
export const decorContent = checkDecor(decor);
