import { Test, TestingModule } from '@nestjs/testing';
import { PeruriController } from './peruri.controller';
import { PeruriService } from './peruri.service';

describe('PeruriController', () => {
  let controller: PeruriController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PeruriController],
      providers: [PeruriService],
    }).compile();

    controller = module.get<PeruriController>(PeruriController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
