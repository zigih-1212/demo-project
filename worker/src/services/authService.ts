import { signToken, verifyPassword } from "../lib/auth";
import { UnauthorizedError, ValidationError } from "../lib/errors";
import { UserRepository } from "../repositories/userRepository";
import type { User } from "../types";

/**
 * Хэш-заглушка для выравнивания времени ответа.
 *
 * Если пользователь не найден, мы всё равно выполняем дорогой PBKDF2,
 * чтобы по времени ответа нельзя было определить, существует ли email.
 */
const DUMMY_HASH =
  "pbkdf2$ZTvrv0UJG8MFsCxsidXCpA$EC2--_suK3P2tvS7M218GQDp2bljU_hOwO2saBPgKEc";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface LoginResult {
  token: string;
  expiresAt: string;
  user: User;
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly secret: string,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      throw new ValidationError("Введите корректный email");
    }
    if (password.length < 6 || password.length > 200) {
      throw new ValidationError("Пароль должен содержать от 6 до 200 символов");
    }

    const found = await this.users.findByEmail(normalizedEmail);
    if (!found) {
      await verifyPassword(password, DUMMY_HASH);
      throw new UnauthorizedError("Неверный email или пароль");
    }

    const valid = await verifyPassword(password, found.passwordHash);
    if (!valid) throw new UnauthorizedError("Неверный email или пароль");

    const { token, expiresAt } = await signToken(found.user, this.secret);
    return { token, expiresAt, user: found.user };
  }
}
