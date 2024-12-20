import { PartialType } from '@nestjs/mapped-types';
import { CreateSysuserDto } from './create-sysuser.dto';

export class UpdateSysuserDto extends PartialType(CreateSysuserDto) {}
