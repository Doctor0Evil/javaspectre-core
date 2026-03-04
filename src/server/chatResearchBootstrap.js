import AlnResearchKernel from '../core/AlnResearchKernel.js';

export const researchKernel = new AlnResearchKernel({
  javaspectreVersion: '0.2.0',
  bostromRpcUrl: 'https://lcd.bostrom.cybernode.ai',
  bostromFromAddress: 'bostrom18sd2ujv24ual9c9pshtxys6j8knh6xaead9ye7',
  evmEnabled: true,
  evmRpcUrl: 'https://mainnet.infura.io/v3/YOUR_KEY',
  evmContractAddress: '0x0000000000000000000000000000000000000000',
  didEnabled: true,
  didController: 'did:example:aln-node-01'
});
