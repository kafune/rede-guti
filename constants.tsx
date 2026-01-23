
import { Region, SupportStatus, Supporter } from './types';

export const REGIONS: Region[] = [
  'Capital', 'RMSP', 'Campinas/RMC', 'Vale do Paraíba', 'Sorocaba', 
  'Ribeirão Preto', 'São José do Rio Preto', 'Bauru/Marília', 
  'Presidente Prudente', 'Baixada Santista', 'Litoral Norte', 'Interior (outros)'
];

// Lista dos principais municípios de SP (Resumida para performance, mas abrangente)
export const SP_MUNICIPALITIES = [
  "São Paulo", "Guarulhos", "Campinas", "São Bernardo do Campo", "Santo André", 
  "São José dos Campos", "Osasco", "Ribeirão Preto", "Sorocaba", "Mauá", 
  "São José do Rio Preto", "Mogi das Cruzes", "Santos", "Diadema", "Jundiaí", 
  "Piracicaba", "Carapicuíba", "Bauru", "Itaquaquecetuba", "São Vicente", 
  "Franca", "Praia Grande", "Guarujá", "Taubaté", "Limeira", "Suzano", 
  "Taboão da Serra", "Sumaré", "Barueri", "Embu das Artes", "Indaiatuba", 
  "Cotia", "Americana", "Itu", "Araraquara", "Jacareí", "Hortolândia", 
  "Presidente Prudente", "Marília", "Itapevi", "Rio Claro", "Bragança Paulista", 
  "Atibaia", "Sertãozinho", "Valinhos", "Botucatu", "Araçatuba", "Ferraz de Vasconcelos"
].sort();

export const MOCK_SUPPORTERS: Supporter[] = [
  { id: '1', name: 'Pr. Arnaldo Silva', whatsapp: '5511988887777', church: 'Assembleia de Deus', region: 'Capital', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), createdBy: 'admin', status: SupportStatus.ACTIVE, notes: 'São Paulo' },
  { id: '2', name: 'Bp. Ricardo Gomes', whatsapp: '5511977776666', church: 'Universal', region: 'RMSP', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), createdBy: 'admin', status: SupportStatus.ACTIVE, notes: 'Guarulhos', referredBy: '1' },
  { id: '3', name: 'Miss. Carla Souza', whatsapp: '5519966665555', church: 'Batista Central', region: 'Campinas/RMC', createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), createdBy: 'admin', status: SupportStatus.VALIDATING, notes: 'Campinas', referredBy: '1' },
  { id: '4', name: 'Rev. Marcos Paulo', whatsapp: '5512955554444', church: 'Presbiteriana', region: 'Vale do Paraíba', createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(), createdBy: 'admin', status: SupportStatus.ACTIVE, notes: 'São José dos Campos' },
  { id: '5', name: 'Pr. Elton John', whatsapp: '5515944443333', church: 'Quadrangular', region: 'Sorocaba', createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), createdBy: 'admin', status: SupportStatus.ACTIVE, notes: 'Sorocaba', referredBy: '2' },
];
