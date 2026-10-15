export type UserDto = {
  id: string;
  studentCode: string | null;
  username: string;
  email: string;
  firstname: string | null;
  lastname: string | null;
  isActive: boolean;
  roles: string[];
  createdAt: string;
};

export type UserListResult = {
  items: UserDto[];
  total: number;
  activeAdminCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
