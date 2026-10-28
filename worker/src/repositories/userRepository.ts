import type { User } from "../types";

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "admin" | "member";
  team: string;
  created_at: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    team: row.team,
    createdAt: row.created_at,
  };
}

const COLUMNS = "id, email, name, password_hash, role, team, created_at";

export class UserRepository {
  constructor(private readonly db: D1Database) {}

  async findByEmail(email: string): Promise<{ user: User; passwordHash: string } | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM users WHERE lower(email) = lower(?)`)
      .bind(email)
      .first<UserRow>();
    if (!row) return null;
    return { user: toUser(row), passwordHash: row.password_hash };
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`)
      .bind(id)
      .first<UserRow>();
    return row ? toUser(row) : null;
  }

  async list(): Promise<User[]> {
    const rows = await this.db
      .prepare(`SELECT ${COLUMNS} FROM users ORDER BY name ASC`)
      .all<UserRow>();
    return (rows.results ?? []).map(toUser);
  }
}
