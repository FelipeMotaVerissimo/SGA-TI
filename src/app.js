const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const session      = require('express-session');
const flash        = require('connect-flash');
const methodOverride = require('method-override');
const path         = require('path');
require('dotenv').config();

const authRoutes         = require('./routes/authRoutes');
const clienteRoutes      = require('./routes/clienteRoutes');
const equipamentoRoutes  = require('./routes/equipamentoRoutes');
const ordemServicoRoutes = require('./routes/ordemServicoRoutes');
const produtoRoutes      = require('./routes/produtoRoutes');
const usuarioRoutes      = require('./routes/usuarioRoutes');
const errorHandler       = require('./middlewares/errorHandler');

const app = express();

// Motor de views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Arquivos estáticos
app.use(express.static(path.join(__dirname, '..', 'public')));

// Middlewares globais
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

// Sessão
app.use(session({
  secret:            process.env.SESSION_SECRET || 'sga_ti_secret',
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 8 * 60 * 60 * 1000 }, // 8 horas
}));

// Flash messages
app.use(flash());

// Variáveis globais para todas as views
app.use((req, res, next) => {
  res.locals.usuario   = req.session.usuario || null;
  res.locals.sucesso   = req.flash('sucesso');
  res.locals.erro      = req.flash('erro');
  next();
});

// Rotas
app.use('/api/auth',         authRoutes);
app.use('/api/clientes',     clienteRoutes);
app.use('/api/equipamentos', equipamentoRoutes);
app.use('/api/ordens',       ordemServicoRoutes);
app.use('/api/produtos',     produtoRoutes);
app.use('/api/usuarios',     usuarioRoutes);

// Rotas de views (web)
app.use('/',         require('./routes/webRoutes'));

// Tratamento global de erros
app.use(errorHandler);

module.exports = app;