import { isRetryableAuthFetchError } from '../../services/auth-error';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: '邮箱或密码不正确',
  email_not_confirmed: '邮箱尚未验证',
  over_request_rate_limit: '操作太频繁，请稍后再试',
  weak_password: '密码至少需要 8 个字符',
};

export function mapAuthError(error: unknown): string {
  if (isRetryableAuthFetchError(error) || error instanceof TypeError) {
    return '网络连接失败，请稍后重试';
  }

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (typeof code === 'string' && Object.hasOwn(AUTH_ERROR_MESSAGES, code)) {
      return AUTH_ERROR_MESSAGES[code];
    }
  }

  return '操作失败，请稍后重试';
}
