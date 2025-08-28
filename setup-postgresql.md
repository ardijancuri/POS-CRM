# PostgreSQL Setup Guide

## Prerequisites
1. Install PostgreSQL on your system
2. Make sure PostgreSQL service is running

## Database Setup Steps

### 1. Create Database
```sql
CREATE DATABASE pos_crm;
```

### 2. Create .env File
Create a `.env` file in the root directory with the following content:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pos_crm
DB_USER=postgres
DB_PASSWORD=your_actual_password

# JWT Secret
JWT_SECRET=your_jwt_secret_key_here

# Server Configuration
PORT=5000
NODE_ENV=development
```

**Important:** Replace `your_actual_password` with your actual PostgreSQL password.

### 3. Run Database Setup
```bash
npm run setup-db
```

### 4. Start the Application
```bash
npm run dev
```

## Default Admin Account
- Email: admin@poscrm.com
- Password: Admin@2024Secure!

## Troubleshooting

### Connection Issues
- Make sure PostgreSQL is running
- Verify your password in the .env file
- Check if the database `pos_crm` exists

### Permission Issues
- Make sure your PostgreSQL user has the necessary permissions
- You might need to grant privileges: `GRANT ALL PRIVILEGES ON DATABASE pos_crm TO postgres;` 