SELECT email, substring("passwordHash" from 1 for 10) AS hash_prefix
FROM "User"
ORDER BY "isSuperAdmin" DESC, email;
