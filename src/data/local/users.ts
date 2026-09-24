import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../../database/client.js';
import { users } from '../../database/schema.js';
import type { User } from '../../domain/entities.js';
import type { NewUser, UserRepository } from '../repositories.js';
import type { Clock } from './clock.js';

export class LocalUserRepository implements UserRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<User | null> {
    return (await this.db.select().from(users).where(eq(users.id, id)).get()) ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    return (await this.db.select().from(users).where(eq(users.username, username)).get()) ?? null;
  }

  async findByIds(ids: readonly string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(users)
      .where(inArray(users.id, [...ids]));
  }

  async create(input: NewUser): Promise<User> {
    const now = this.clock();
    const [user] = await this.db
      .insert(users)
      .values({ id: randomUUID(), email: null, ...input, createdAt: now, updatedAt: now })
      .returning();
    return must(user);
  }
}

export function must<T>(row: T | undefined): T {
  if (row === undefined) throw new Error('Expected the database to return a row');
  return row;
}
