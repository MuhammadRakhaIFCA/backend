import { Test, TestingModule } from '@nestjs/testing';
import { SysusersController } from './sysusers.controller';
import { SysusersService } from './sysusers.service';

describe('SysusersController', () => {
  let controller: SysusersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SysusersController],
      providers: [SysusersService],
    }).compile();

    controller = module.get<SysusersController>(SysusersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
