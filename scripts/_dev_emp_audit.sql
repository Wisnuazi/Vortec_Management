SELECT e.id, e.name, e."roleId", r.title
FROM "Employee" e
JOIN "Role" r ON r.id = e."roleId"
ORDER BY r.title, e.name;
