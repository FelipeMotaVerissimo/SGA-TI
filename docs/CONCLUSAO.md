# Capítulo 4 — Conclusão

> **Rascunho para o documento do TCC.** Extensão: 519 palavras, dentro da
> faixa de 400 a 600. As dificuldades relatadas saíram dos LEIAMEs de cada
> módulo e do histórico de commits — são defeitos e decisões registrados no
> momento em que aconteceram, não reconstituídos depois.

---

## 4.1 O projeto e seu desenvolvimento

O SGA TI é um sistema web para gestão de assistências técnicas de informática,
desenvolvido em Node.js com Express, Prisma e MySQL, com interface renderizada no
servidor em EJS. Cobre o ciclo completo de um atendimento: cadastro de cliente e
equipamento, ordem de serviço, orçamento, serviços executados com controle de
garantia, consumo de peças do estoque, faturamento, relatórios gerenciais e a
entrega do equipamento, que o cliente acompanha num mapa. O acesso é segmentado
em sete perfis, e o cliente consulta o próprio conserto sem autenticação.

O desenvolvimento foi dividido em seis módulos entregues em sequência, cada um
documentado com suas regras de negócio e decisões, e coberto por testes
automatizados. A suíte final reúne 836 casos, executados a cada alteração por
integração contínua contra um servidor MySQL. Rastreabilidade das operações e
política de retenção de dados pessoais foram incorporadas ao final.

## 4.2 Dificuldades encontradas

A principal dificuldade foi de modelagem. Três dos quatro relatórios previstos
não tinham de onde extrair dado: agrupar serviços pela descrição em texto livre
produziria um grupo por registro, o que exigiu um catálogo de tipos de serviço; o
relatório por tipo de equipamento exigiu um campo que não existia. Requisito que
não foi confrontado com o modelo de dados durante a análise cobra esse preço na
implementação.

A segunda foi a ausência de um servidor MySQL no desenvolvimento, que levou a
trabalhar com SQLite. A divergência entre os bancos gerou defeitos reais: um
campo de data gravado como texto deixou um relatório vazio, e a auditoria,
gravada durante uma transação, travou a aplicação. O fuso horário apareceu quatro
vezes, em contextos distintos — a previsão de entrega, os nomes do arquivo
exportado e do backup, e a tela do entregador —, sempre pela mesma causa: usar o
horário do servidor quando a intenção era o de Dourados.

A terceira foi perceber que dado pessoal não fica só onde é cadastrado. A
anonimização apagava o cliente, mas o faturamento já havia copiado o nome para a
conta a receber, e a auditoria guardava ambos. No rastreamento de entregas o
caso se repetiu com a localização: a coordenada da casa do cliente estava também
no registro de auditoria, no motivo da não entrega e no trajeto do entregador.

Parte dos defeitos só apareceu fora dos testes automatizados: no navegador, num
celular real — que disparava de uma vez os envios de posição acumulados com a
tela bloqueada — e nas capturas de tela do manual. Houve também divergências
entre o documento e o sistema, como bibliotecas citadas que o projeto não usa;
foram registradas e tratadas como questão de redação.

## 4.3 Trabalhos futuros

A política de retenção define prazos, mas só o trajeto das entregas é apagado
automaticamente; a anonimização do cliente ainda depende de pedido. A sessão, o
controle de tentativas e a fila de posições vivem na memória do processo, o que
basta para uma assistência, mas não para mais de uma instância. Com a tela do
celular bloqueada o navegador interrompe o envio da localização, e rastrear em
segundo plano exigiria um aplicativo nativo. Por fim, a avaliação de usabilidade
e os testes em outros navegadores e aparelhos ainda precisam ser aplicados.
