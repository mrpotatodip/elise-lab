// -----
// What the insert needs: the validated body
// with the password already hashed and the slug
// picked.
// -----
export type NewAccount = {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  accountName: string;
  timezone: string;
  slug: string;
};
