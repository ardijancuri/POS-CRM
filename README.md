# 🧾 POS CRM System

A comprehensive Point of Sale (POS) and Customer Relationship Management (CRM) system built with modern web technologies.

## 🚀 Features

### 🔐 Authentication & Access Control
- JWT-based authentication
- Role-based access control (Admin/Client)
- Secure password hashing with bcrypt
- Protected routes and middleware

### 👥 User Roles

#### Admin
- Full system access and management
- Product CRUD operations
- Order management and status updates
- User management
- Analytics dashboard
- PDF invoice generation for all orders

#### Client
- View/edit personal profile
- Browse product catalog (without prices)
- Create and manage orders
- View order history
- Download PDF invoices for own orders

### 📦 Core Features
- **Product Management**: Add, edit, delete products with stock tracking
- **Order Management**: Create orders, track status, manage inventory
- **User Management**: Admin can view and manage all users
- **PDF Invoices**: Server-side PDF generation using PDFKit
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Real-time Notifications**: Toast notifications for user feedback
- **Search & Filtering**: Advanced product and order filtering
- **Pagination**: Efficient data loading for large datasets

## 🛠 Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Database
- **JWT** - Authentication
- **PDFKit** - PDF generation
- **bcryptjs** - Password hashing
- **Helmet** - Security middleware

### Frontend
- **React.js** - UI library
- **Tailwind CSS** - Styling framework
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **React Hot Toast** - Notifications
- **Lucide React** - Icons

## 📋 Prerequisites

Before running this application, make sure you have the following installed:

- **Node.js** (v14 or higher)
- **PostgreSQL** (v12 or higher)
- **npm** or **yarn**

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd pos-crm-system
```

### 2. Install Dependencies
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

### 3. Environment Configuration
Create a `.env` file in the root directory:
```bash
# Copy the example environment file
cp env.example .env
```

Update the `.env` file with your configuration:
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pos_crm_db
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# File Upload Configuration
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=5242880
```

### 4. Database Setup
```bash
# Create PostgreSQL database
createdb pos_crm_db

# Run database setup script
npm run setup-db
```

### 5. Start the Application
```bash
# Start both backend and frontend (development)
npm run dev

# Or start them separately:
# Backend only
npm run server

# Frontend only
npm run client
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000

## 👤 Default Admin Account

After running the database setup, you can log in with the default admin account:

- **Email**: admin@poscrm.com
- **Password**: admin123

## 📁 Project Structure

```
pos-crm-system/
├── server/                 # Backend code
│   ├── database/          # Database connection and setup
│   ├── middleware/        # Authentication middleware
│   ├── routes/           # API routes
│   └── index.js          # Server entry point
├── client/               # Frontend React app
│   ├── public/           # Static files
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── contexts/     # React contexts
│   │   ├── pages/        # Page components
│   │   │   ├── admin/    # Admin pages
│   │   │   └── client/   # Client pages
│   │   └── App.js        # Main app component
│   └── package.json
├── uploads/              # File uploads directory
├── package.json          # Backend dependencies
└── README.md
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration

### Users
- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/:id` - Update user profile

### Products
- `GET /api/products` - Get products (admin: with prices, client: without prices)
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product (admin only)
- `PUT /api/products/:id` - Update product (admin only)
- `DELETE /api/products/:id` - Delete product (admin only)

### Orders
- `GET /api/orders` - Get orders (admin: all, client: own)
- `GET /api/orders/:id` - Get order details
- `POST /api/orders` - Create order (client only)
- `PUT /api/orders/:id/status` - Update order status (admin only)
- `GET /api/orders/:id/invoice` - Download PDF invoice

## 🎨 UI Components

The application uses a consistent design system with:

- **Cards**: For content containers
- **Buttons**: Primary, secondary, and danger variants
- **Forms**: Consistent input styling
- **Badges**: Status indicators
- **Loading States**: Spinners and skeletons
- **Notifications**: Toast messages

## 🔒 Security Features

- JWT token authentication
- Password hashing with bcrypt
- Role-based access control
- Input validation and sanitization
- CORS configuration
- Rate limiting
- Helmet security headers

## 📱 Responsive Design

The application is fully responsive and works on:
- Desktop computers
- Tablets
- Mobile phones

## 🚀 Deployment

### Backend Deployment
1. Set up a PostgreSQL database
2. Configure environment variables
3. Run `npm run build` (if applicable)
4. Start the server with `npm start`

### Frontend Deployment
1. Build the React app: `cd client && npm run build`
2. Deploy the `build` folder to your hosting service
3. Configure the API endpoint in production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

If you encounter any issues or have questions:

1. Check the documentation
2. Review the code comments
3. Open an issue on GitHub

## 🎯 Future Enhancements

- [ ] Email notifications
- [ ] Advanced analytics
- [ ] Inventory alerts
- [ ] Multi-language support
- [ ] Dark mode
- [ ] Mobile app
- [ ] Payment integration
- [ ] Advanced reporting

---

**Built with ❤️ using modern web technologies** 