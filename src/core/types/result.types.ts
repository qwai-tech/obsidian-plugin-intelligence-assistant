// Result types
import { AppError } from '../errors';

export type Result<T> = {
  success: boolean;
  data?: T;
  error?: AppError;
};

export type ValidationResult = {
  success: boolean;
  errors: string[];
};