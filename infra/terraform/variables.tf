variable "tenancy_ocid" {}
variable "user_ocid" {}
variable "fingerprint" {}
variable "private_key_path" {}
variable "region" {}
variable "compartment_ocid" {}

variable "instance_shape" {
  default = "VM.Standard.A1.Flex"
}

variable "instance_ocpus" {
  default = 1
}

variable "instance_memory_gb" {
  default = 6
}