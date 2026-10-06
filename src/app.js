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
const financeiroRoutes   = require('./routes/financeiroRoutes');
const usuarioRoutes      = require('./routes/usuarioRoutes');
const errorHandler       = require('./middlewares/errorHandler');
const { temPermissao }   = require('./middlewares/perfilMiddleware');
const { contextoMiddleware } = require('./middlewares/contextoMiddleware'); // NF005

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

/**
 * Sessão.
 *
 * O segredo tinha um fallback fixo no fonte (`|| 'sga_ti_secret'`). Sem a
 * variável de ambiente, os cookies de sessão passavam a ser assinados com um
 * valor público e versionado — qualquer um podia forjar uma sessão. Agora
 * falha alto, como o JWT já fazia, em vez de degradar em silêncio.
 */
if (!process.env.SESSION_SECRET) {
  throw new Error(
    'SESSION_SECRET não definida. Crie o arquivo .env conforme docs/COMO-RODAR.md, seção 2.'
  );
}

app.use(session({
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 8 * 60 * 60 * 1000 }, // 8 horas
}));

// Flash messages
app.use(flash());

// NF005 — contexto da requisição (quem e de onde), lido pela auditoria.
// Depois da sessão, porque é dela que sai a identidade nas telas.
app.use(contextoMiddleware);

// Variáveis globais para todas as views
app.use((req, res, next) => {
  res.locals.usuario   = req.session.usuario || null;
  res.locals.sucesso   = req.flash('sucesso');
  res.locals.erro      = req.flash('erro');
  res.locals.aviso     = req.flash('aviso');   // Módulo 4: estoque negativo etc.
  res.locals.temPermissao = temPermissao;      // Módulo 4: usado pela sidebar
  next();
});

// Rotas
app.use('/api/auth',         authRoutes);
app.use('/api/clientes',     clienteRoutes);
app.use('/api/equipamentos', equipamentoRoutes);
app.use('/api/ordens',       ordemServicoRoutes);
app.use('/api/produtos',     produtoRoutes);
app.use('/api/financeiro',   financeiroRoutes);
app.use('/api/usuarios',     usuarioRoutes);

// Rotas de views (web)
app.use('/',         require('./routes/webRoutes'));

// Tratamento global de erros
app.use(errorHandler);

module.exports = app;