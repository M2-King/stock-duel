/**
 * 统一 API 响应格式：
 *   成功 → { code: 0, data, message }
 *   失败 → { code: 非0, data: null, message }
 */
export interface ApiResponse<T = any> {
  code: number;
  data: T | null;
  message: string;
}

export const Ok = <T = any>(data: T, message = 'ok'): ApiResponse<T> => ({
  code: 0,
  data,
  message,
});

export const Fail = (message: string, code = 1, data: any = null): ApiResponse => ({
  code,
  data,
  message,
});
