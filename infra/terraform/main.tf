terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 5.0"
    }
  }
}

provider "oci" {
  tenancy_ocid     = var.tenancy_ocid
  user_ocid        = var.user_ocid
  fingerprint      = var.fingerprint
  private_key_path = var.private_key_path
  region           = var.region
}

# --- Networking ---

resource "oci_core_vcn" "opsforge_vcn" {
  compartment_id = var.compartment_ocid
  cidr_block     = "10.0.0.0/16"
  display_name   = "opsforge-vcn"
}

resource "oci_core_internet_gateway" "opsforge_igw" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.opsforge_vcn.id
  display_name   = "opsforge-igw"
}

resource "oci_core_route_table" "opsforge_rt" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.opsforge_vcn.id
  display_name   = "opsforge-route-table"

  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.opsforge_igw.id
  }
}

resource "oci_core_security_list" "opsforge_sl" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.opsforge_vcn.id
  display_name   = "opsforge-security-list"

  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 22
      max = 22
    }
  }
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 80
      max = 80
    }
  }
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 443
      max = 443
    }
  }
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 6443
      max = 6443
    }
  }

  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
  }
}

resource "oci_core_subnet" "opsforge_subnet" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.opsforge_vcn.id
  cidr_block                 = "10.0.1.0/24"
  display_name               = "opsforge-subnet"
  route_table_id             = oci_core_route_table.opsforge_rt.id
  security_list_ids          = [oci_core_security_list.opsforge_sl.id]
}

# --- Compute ---

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_ocid
}

data "oci_core_images" "ubuntu" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = var.instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_instance" "opsforge_vm" {
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  shape               = var.instance_shape
  display_name        = "opsforge-vm"

  shape_config {
    ocpus         = var.instance_ocpus
    memory_in_gbs = var.instance_memory_gb
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.opsforge_subnet.id
    assign_public_ip = true
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu.images[0].id
  }

  metadata = {
    ssh_authorized_keys = file("~/.ssh/id_rsa.pub")
  }
}

output "instance_public_ip" {
  value = oci_core_instance.opsforge_vm.public_ip
}