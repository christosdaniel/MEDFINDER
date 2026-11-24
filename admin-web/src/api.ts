import { createApi } from '@medfinder/web-shared';
export const api = createApi('mf_admin_token');
export type Admin = { id: number; name: string; email: string };
