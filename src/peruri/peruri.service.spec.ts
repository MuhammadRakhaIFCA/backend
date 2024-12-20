import { Test, TestingModule } from '@nestjs/testing';
import { PeruriService } from './peruri.service';

describe('PeruriService', () => {
  let service: PeruriService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PeruriService],
    }).compile();

    service = module.get<PeruriService>(PeruriService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
